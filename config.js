require("dotenv").config();

if (!process.env.SENDER_EMAIL) {
  console.warn(
    "Warning: SENDER_EMAIL is not set in environment variables. " +
    "Copy .env.example to .env and set your Gmail address."
  );
}

module.exports = {
  LABEL_NAME: "AUTOMATED",
  MIN_INTERVAL: 45,
  MAX_INTERVAL: 120,
  MAX_EXECUTIONS: parseInt(process.env.MAX_EXECUTIONS, 10) || 0,
  SENDER_EMAIL: process.env.SENDER_EMAIL || "",
  TOKEN_PATH: require("path").join(process.cwd(), "token.json"),
  CREDENTIALS_PATH: require("path").join(process.cwd(), "credentials.json"),
};
