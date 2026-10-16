/**
 * Gyandhara Mobile App Bridge & Field Intelligence Helper
 * 
 * Provides seamless two-way communication between this React web portal
 * and host mobile apps (React Native, Flutter, Android WebView, iOS WKWebView, or PWA).
 */

// Detect if running inside a mobile WebView or app container
export function isMobileAppEnvironment() {
  if (typeof window === 'undefined') return false;
  
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('mobileApp') === 'true' || searchParams.get('inApp') === 'true') {
    return true;
  }
  
  return Boolean(
    window.ReactNativeWebView ||
    window.flutter_inappwebview ||
    (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gyandharaBridge) ||
    window.AndroidBridge ||
    window.JSBridge ||
    (window.parent && window.parent !== window)
  );
}

// Parse initial URL query parameters passed by the mobile app
export function getMobileInitialParams() {
  if (typeof window === 'undefined') return {};
  
  const params = new URLSearchParams(window.location.search);
  const result = {};
  
  const keys = [
    'regName', 'regMobile', 'zone', 'rateZone', 'rsm', 'asm', 'se', 'dbId',
    'firmName', 'contactPerson', 'mobile1', 'mobile2', 'email', 'gst', 'pan',
    'district', 'tehsil', 'pincode',
    'hideHeader', 'lockOfficer', 'theme', 'lang', 'token'
  ];
  
  for (const k of keys) {
    const val = params.get(k);
    if (val !== null && val !== undefined && val.trim() !== '') {
      result[k] = val.trim();
    }
  }
  
  return result;
}

/**
 * Dispatch an event to the host mobile app
 * Supports React Native WebView, Flutter, Android WebChromeClient/JavascriptInterface,
 * iOS WKScriptMessageHandler, and iframe window.parent.
 */
export function sendToMobileApp(eventType, payload = {}) {
  const message = {
    source: 'GYANDHARA_DBR_WEB',
    type: eventType,
    timestamp: Date.now(),
    payload,
  };

  const jsonStr = JSON.stringify(message);

  // 1. React Native WebView
  if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
    try {
      window.ReactNativeWebView.postMessage(jsonStr);
    } catch (e) {
      console.warn('Bridge React Native error:', e);
    }
  }

  // 2. Flutter InAppWebView
  if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') {
    try {
      window.flutter_inappwebview.callHandler('gyandharaBridge', message);
    } catch (e) {
      console.warn('Bridge Flutter error:', e);
    }
  }

  // 3. iOS WebKit ScriptMessageHandler
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gyandharaBridge) {
    try {
      window.webkit.messageHandlers.gyandharaBridge.postMessage(message);
    } catch (e) {
      console.warn('Bridge iOS error:', e);
    }
  }

  // 4. Android JavaScriptInterface
  if (window.AndroidBridge && typeof window.AndroidBridge.postMessage === 'function') {
    try {
      window.AndroidBridge.postMessage(jsonStr);
    } catch (e) {
      console.warn('Bridge Android error:', e);
    }
  }

  // 5. Parent iframe window (if embedded in a web dashboard / Electron / iframe)
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage(message, '*');
    } catch (e) {
      console.warn('Bridge parent postMessage error:', e);
    }
  }

  // Also dispatch as local custom DOM event for any in-page listeners
  try {
    window.dispatchEvent(new CustomEvent('gyandhara:bridge', { detail: message }));
  } catch {
    // ignore
  }
}

/**
 * Trigger subtle haptic tactile feedback for native mobile feel
 */
export function triggerHaptic(type = 'light') {
  if (typeof window === 'undefined') return;

  // Notify mobile app bridge so native code can trigger native haptic engine
  sendToMobileApp('DBR_HAPTIC', { type });

  // Web Vibration API fallback
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      switch (type) {
        case 'light':
          navigator.vibrate(15);
          break;
        case 'medium':
          navigator.vibrate(25);
          break;
        case 'heavy':
          navigator.vibrate(40);
          break;
        case 'success':
          navigator.vibrate([15, 60, 25]);
          break;
        case 'warning':
          navigator.vibrate([35, 40, 35]);
          break;
        case 'error':
          navigator.vibrate([45, 50, 45, 50, 45]);
          break;
        default:
          navigator.vibrate(15);
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Capture current GPS Coordinates for agricultural shop geo-tagging
 */
export function getGPSCoordinates() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your device or browser.'));
      return;
    }

    triggerHaptic('light');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        triggerHaptic('success');
        resolve({
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
          accuracy: Math.round(accuracy),
          formatted: `${latitude.toFixed(5)}° N, ${longitude.toFixed(5)}° E (±${Math.round(accuracy)}m)`,
          mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
        });
      },
      (err) => {
        triggerHaptic('warning');
        let errorMsg = 'Could not access location.';
        if (err.code === 1) errorMsg = 'Location permission denied. Please enable GPS in app settings.';
        else if (err.code === 2) errorMsg = 'GPS signal unavailable. Ensure location is turned on.';
        else if (err.code === 3) errorMsg = 'GPS request timed out. Please try again.';
        reject(new Error(errorMsg));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
      }
    );
  });
}

/**
 * Offline Indian PIN code intelligence:
 * Suggests State and District based on the first 2-3 digits of PIN code
 */
const PIN_REGIONS = [
  { prefix: '45', state: 'Madhya Pradesh', sampleDistrict: 'Indore / Ujjain / Dhar / Khargone' },
  { prefix: '46', state: 'Madhya Pradesh', sampleDistrict: 'Bhopal / Sehore / Hoshangabad' },
  { prefix: '47', state: 'Madhya Pradesh', sampleDistrict: 'Gwalior / Morena / Shivpuri' },
  { prefix: '48', state: 'Madhya Pradesh', sampleDistrict: 'Jabalpur / Chhindwara / Rewa' },
  { prefix: '49', state: 'Chhattisgarh', sampleDistrict: 'Raipur / Bilaspur / Durg' },
  { prefix: '40', state: 'Maharashtra', sampleDistrict: 'Mumbai / Konkan / Goa border' },
  { prefix: '41', state: 'Maharashtra', sampleDistrict: 'Pune / Satara / Solapur' },
  { prefix: '42', state: 'Maharashtra', sampleDistrict: 'Nashik / Dhule / Jalgaon' },
  { prefix: '43', state: 'Maharashtra', sampleDistrict: 'Aurangabad / Nanded' },
  { prefix: '44', state: 'Maharashtra', sampleDistrict: 'Nagpur / Amravati / Akola' },
  { prefix: '30', state: 'Rajasthan', sampleDistrict: 'Jaipur / Alwar / Dausa' },
  { prefix: '31', state: 'Rajasthan', sampleDistrict: 'Udaipur / Kota / Chittorgarh' },
  { prefix: '32', state: 'Rajasthan', sampleDistrict: 'Bharatpur / Sawai Madhopur' },
  { prefix: '33', state: 'Rajasthan', sampleDistrict: 'Bikaner / Churu / Sikar' },
  { prefix: '34', state: 'Rajasthan', sampleDistrict: 'Jodhpur / Pali / Barmer' },
  { prefix: '20', state: 'Uttar Pradesh', sampleDistrict: 'Aligarh / Agra / Mathura' },
  { prefix: '21', state: 'Uttar Pradesh', sampleDistrict: 'Allahabad (Prayagraj) / Fatehpur' },
  { prefix: '22', state: 'Uttar Pradesh', sampleDistrict: 'Lucknow / Barabanki / Rae Bareli' },
  { prefix: '23', state: 'Uttar Pradesh', sampleDistrict: 'Varanasi / Mirzapur' },
  { prefix: '24', state: 'Uttar Pradesh', sampleDistrict: 'Moradabad / Bareilly' },
  { prefix: '25', state: 'Uttar Pradesh', sampleDistrict: 'Meerut / Muzaffarnagar' },
  { prefix: '26', state: 'Uttar Pradesh', sampleDistrict: 'Lakhimpur / Pilibhit' },
  { prefix: '27', state: 'Uttar Pradesh', sampleDistrict: 'Gorakhpur / Basti / Deoria' },
  { prefix: '28', state: 'Uttar Pradesh', sampleDistrict: 'Jhansi / Lalitpur / Banda' },
  { prefix: '36', state: 'Gujarat', sampleDistrict: 'Rajkot / Jamnagar' },
  { prefix: '37', state: 'Gujarat', sampleDistrict: 'Bhavnagar / Junagadh' },
  { prefix: '38', state: 'Gujarat', sampleDistrict: 'Ahmedabad / Gandhinagar' },
  { prefix: '39', state: 'Gujarat', sampleDistrict: 'Surat / Vadodara / Bharuch' },
];

export function lookupPinCode(pincode) {
  if (!pincode || String(pincode).length < 2) return null;
  const p = String(pincode).slice(0, 2);
  const found = PIN_REGIONS.find((r) => r.prefix === p);
  return found || null;
}
