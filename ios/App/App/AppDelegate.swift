import UIKit
import Capacitor
import HealthKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

/**
 * Read-only HealthKit bridge. It intentionally never requests write access and
 * never treats application launch as proof that HealthKit read access exists.
 */
@objc(AppleHealthPlugin)
public class AppleHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleHealthPlugin"
    public let jsName = "AppleHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSamples", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWorkouts", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable(), "platform": "ios"])
    }

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["state": "UNAVAILABLE", "can_request": false])
            return
        }
        let metrics = call.getArray("metrics", String.self) ?? Self.defaultMetrics
        let types = Self.healthTypes(for: metrics)
        healthStore.getRequestStatusForAuthorization(toShare: [], read: types) { status, error in
            if let error = error {
                call.reject("Unable to determine HealthKit authorization request status", nil, error)
                return
            }
            let state: String
            switch status {
            case .shouldRequest: state = "NOT_REQUESTED"
            case .unnecessary: state = "REQUEST_NOT_NEEDED"
            @unknown default: state = "UNKNOWN"
            }
            // HealthKit deliberately does not reveal per-type read grants. The
            // client verifies access from actual query results instead.
            call.resolve(["state": state, "can_request": status == .shouldRequest, "read_access_verifiable_by_query": true])
        }
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit is unavailable on this device")
            return
        }
        let metrics = call.getArray("metrics", String.self) ?? Self.defaultMetrics
        let types = Self.healthTypes(for: metrics)
        guard !types.isEmpty else {
            call.reject("No supported HealthKit read metrics were requested")
            return
        }
        healthStore.requestAuthorization(toShare: [], read: types) { success, error in
            if let error = error {
                call.reject("HealthKit authorization request failed", nil, error)
                return
            }
            call.resolve([
                "request_completed": success,
                "state": success ? "PENDING_READ_VERIFICATION" : "NOT_REQUESTED"
            ])
        }
    }

    @objc func readSamples(_ call: CAPPluginCall) {
        guard let metric = call.getString("metric"), let sampleType = Self.sampleType(for: metric) else {
            call.resolve(["metric": call.getString("metric") ?? "unknown", "state": "DENIED_OR_UNAVAILABLE", "reason": "unsupported_metric", "samples": []])
            return
        }
        let range = Self.dateRange(for: call)
        let predicate = HKQuery.predicateForSamples(withStart: range.from, end: range.to, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: sampleType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error {
                call.resolve(["metric": metric, "state": Self.accessState(for: error), "reason": Self.accessReason(for: error), "samples": []])
                return
            }
            let payload = (samples ?? []).compactMap { Self.serialize(sample: $0, metric: metric) }
            call.resolve(["metric": metric, "state": payload.isEmpty ? "NO_DATA" : "AVAILABLE", "samples": payload])
        }
        healthStore.execute(query)
    }

    @objc func readWorkouts(_ call: CAPPluginCall) {
        let range = Self.dateRange(for: call)
        let predicate = HKQuery.predicateForSamples(withStart: range.from, end: range.to, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error = error {
                call.resolve(["state": Self.accessState(for: error), "reason": Self.accessReason(for: error), "workouts": []])
                return
            }
            let workouts = (samples ?? []).compactMap { $0 as? HKWorkout }.map { workout in
                [
                    "id": workout.uuid.uuidString,
                    "activity_type": workout.workoutActivityType.rawValue,
                    "start_at": Self.iso8601.string(from: workout.startDate),
                    "end_at": Self.iso8601.string(from: workout.endDate),
                    "duration_minutes": workout.duration / 60,
                    "active_calories": workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) as Any
                ]
            }
            call.resolve(["state": workouts.isEmpty ? "NO_DATA" : "AVAILABLE", "workouts": workouts])
        }
        healthStore.execute(query)
    }

    private static let iso8601 = ISO8601DateFormatter()
    private static let defaultMetrics = ["hrv_sdnn", "resting_heart_rate", "heart_rate", "sleep_duration", "steps", "active_calories", "spo2", "respiratory_rate"]

    private static func healthTypes(for metrics: [String]) -> Set<HKObjectType> {
        Set(metrics.compactMap { sampleType(for: $0) })
    }

    private static func sampleType(for metric: String) -> HKSampleType? {
        switch metric {
        case "hrv_sdnn": return HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)
        case "resting_heart_rate": return HKObjectType.quantityType(forIdentifier: .restingHeartRate)
        case "heart_rate": return HKObjectType.quantityType(forIdentifier: .heartRate)
        case "sleep_duration": return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        case "steps": return HKObjectType.quantityType(forIdentifier: .stepCount)
        case "active_calories": return HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)
        case "spo2": return HKObjectType.quantityType(forIdentifier: .oxygenSaturation)
        case "respiratory_rate": return HKObjectType.quantityType(forIdentifier: .respiratoryRate)
        default: return nil
        }
    }

    private static func dateRange(for call: CAPPluginCall) -> (from: Date, to: Date) {
        let now = Date()
        let fallback = Calendar.current.date(byAdding: .day, value: -30, to: now) ?? now
        return (iso8601.date(from: call.getString("from") ?? "") ?? fallback, iso8601.date(from: call.getString("to") ?? "") ?? now)
    }

    private static func serialize(sample: HKSample, metric: String) -> [String: Any]? {
        var result: [String: Any] = [
            "id": sample.uuid.uuidString,
            "metric": metric,
            "start_at": iso8601.string(from: sample.startDate),
            "end_at": iso8601.string(from: sample.endDate),
            "recorded_at": iso8601.string(from: sample.endDate),
            "source_bundle": sample.sourceRevision.source.bundleIdentifier
        ]
        if let quantity = sample as? HKQuantitySample {
            switch metric {
            case "hrv_sdnn": result["value"] = quantity.quantity.doubleValue(for: .secondUnit(with: .milli)); result["unit"] = "ms"
            case "resting_heart_rate", "heart_rate": result["value"] = quantity.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())); result["unit"] = "bpm"
            case "steps": result["value"] = quantity.quantity.doubleValue(for: .count()); result["unit"] = "count"
            case "active_calories": result["value"] = quantity.quantity.doubleValue(for: .kilocalorie()); result["unit"] = "kcal"
            case "spo2": result["value"] = quantity.quantity.doubleValue(for: .percent()) * 100; result["unit"] = "percent"
            case "respiratory_rate": result["value"] = quantity.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())); result["unit"] = "breaths_per_minute"
            default: return nil
            }
            return result
        }
        if let category = sample as? HKCategorySample, metric == "sleep_duration" {
            result["value"] = category.endDate.timeIntervalSince(category.startDate) / 60
            result["unit"] = "minutes"
            result["sleep_stage"] = category.value
            return result
        }
        return nil
    }

    private static func accessState(for error: Error) -> String {
        guard let healthError = error as? HKError else { return "ERROR" }
        switch healthError.code {
        case .errorAuthorizationDenied, .errorRequiredAuthorizationDenied, .errorHealthDataUnavailable:
            return "DENIED_OR_UNAVAILABLE"
        case .errorDatabaseInaccessible:
            return "RESTRICTED"
        case .errorAuthorizationNotDetermined:
            return "NOT_REQUESTED"
        default:
            return "ERROR"
        }
    }

    private static func accessReason(for error: Error) -> String {
        switch accessState(for: error) {
        case "DENIED_OR_UNAVAILABLE": return "denied_or_unavailable"
        case "RESTRICTED": return "restricted"
        case "NOT_REQUESTED": return "not_requested"
        default: return "query_error"
        }
    }
}

class HealthBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginType(AppleHealthPlugin.self)
    }
}
