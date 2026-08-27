import CoreLocation
import Foundation

// The one-shot location fix, SHARED (2026-08-27). It lived in the phone's
// `MetadataService`, which is why a note recorded on the Mac had an empty `location:`
// while the same note recorded on the phone had a place — Tuur asked for parity, and the
// fix is to stop the Mac having no copy rather than to give it a second one.
//
// Only THIS half moves: `MetadataService` also reads `CMPedometer`, which does not exist
// on macOS, so steps stay phone-only. CoreLocation and CLGeocoder are on both.

/// One-shot CoreLocation fix + reverse-geocode. Returns nil if unauthorized or
/// the fix fails. Created/used on the main actor so delegate callbacks arrive.
@MainActor
final class LocationOneShot: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<LocationInfo?, Never>?

    func current() async -> LocationInfo? {
        let status = manager.authorizationStatus
        guard Self.isUsable(status) else { return nil }
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            manager.delegate = self
            if status == .notDetermined { manager.requestWhenInUseAuthorization() }
            manager.requestLocation()
        }
    }

    /// macOS has no `.authorizedWhenInUse` — it grants `.authorizedAlways` — so the two
    /// platforms genuinely name this differently and a shared file has to say so.
    private static func isUsable(_ status: CLAuthorizationStatus) -> Bool {
        if status == .authorizedAlways || status == .notDetermined { return true }
        #if os(iOS)
        return status == .authorizedWhenInUse
        #else
        return false
        #endif
    }

    private func finish(_ info: LocationInfo?) {
        guard let continuation else { return }
        self.continuation = nil
        continuation.resume(returning: info)
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.first else {
            Task { @MainActor in self.finish(nil) }
            return
        }
        Task { @MainActor in
            let place = await Self.reverseGeocode(location)
            self.finish(LocationInfo(
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude,
                placeName: place
            ))
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.finish(nil) }
    }

    private static func reverseGeocode(_ location: CLLocation) async -> String? {
        let placemarks = try? await CLGeocoder().reverseGeocodeLocation(location)
        guard let placemark = placemarks?.first else { return nil }
        // Prefer the most SPECIFIC name that fits, walking town/neighborhood →
        // municipality → region (never jump straight to the broad region like
        // "Lisbon"). Some regions return very long parish-union names; skip
        // those in favor of the next concise component, truncating only as a
        // last resort.
        let ordered = [placemark.subLocality, placemark.locality,
                       placemark.subAdministrativeArea, placemark.administrativeArea, placemark.name]
            .compactMap { $0 }.filter { !$0.isEmpty }
        guard !ordered.isEmpty else { return nil }
        if let concise = ordered.first(where: { $0.count <= 22 }) { return concise }
        return String(ordered[0].prefix(20)).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }
}
