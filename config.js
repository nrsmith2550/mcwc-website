// Mountain Cat Wrestling Club — site settings
//
// Paste your Firebase web app config below
// (Firebase console → Project settings → General → Your apps → SDK setup and configuration → Config).
// These values are designed to be public. Access is controlled by the Firestore security rules
// in firestore.rules, not by keeping this config secret.
//
// While `firebase` is null, the site runs in demo mode with sample posts.
window.MCWC_CONFIG = {
  firebase: null,
  // firebase: {
  //   apiKey: "...",
  //   authDomain: "your-project.firebaseapp.com",
  //   projectId: "your-project",
  //   storageBucket: "your-project.appspot.com",
  //   messagingSenderId: "...",
  //   appId: "..."
  // },
  joinUrl: ""   // optional: link to your membership payment page (e.g. Zeffy)
};
