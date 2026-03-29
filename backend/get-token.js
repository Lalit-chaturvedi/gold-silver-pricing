require("dotenv").config();
const { FivePaisaClient } = require("5paisajs");

const conf = {
  appSource:     "27478",
  appName:       "RAMAGOLD",
  userId:        "YOUR_5PAISA_EMAIL",       // your 5paisa login email
  password:      "YOUR_5PAISA_PASSWORD",    // your 5paisa login password
  userKey:       "870fd2MmgeYvuJ56JmDPtdzwTOPfblo8",
  encryptionKey: "8GwJiAxmTdjkg",
  clientCode:    "54955888",        // your 5paisa client code
};

const client = new FivePaisaClient(conf);

// Get TOTP from your Google Authenticator app
const TOTP  = "123456";   // ← replace with current TOTP from authenticator
const PIN   = "YOUR_MPIN"; // ← your 5paisa MPIN

client.get_TOTP_Session(conf.clientCode, TOTP, PIN)
  .then((res) => {
    console.log("✅ Success!");
    console.log("Access Token:", res.data?.AccessToken || res);
  })
  .catch((err) => {
    console.error("❌ Error:", err.message || err);
  });