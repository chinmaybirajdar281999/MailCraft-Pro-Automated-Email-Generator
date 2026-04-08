require("dotenv").config();
const fs = require("fs").promises;
const path = require("path"); // Built-in module that provides utilities for working with file and directory paths.
const process = require("process"); // Global object that provides information and control over the current Node.js process.
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const MailComposer = require("nodemailer/lib/mail-composer"); // Nodemailer - NodeJS library to create email template for sending.
const {
  LABEL_NAME,
  MIN_INTERVAL,
  MAX_INTERVAL,
  MAX_EXECUTIONS,
  SENDER_EMAIL,
  TOKEN_PATH,
  CREDENTIALS_PATH,
} = require("./config");

// If modifying these scopes, delete token.json.
// SCOPES are the authorization of the services given by google.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.modify",
];

// Handle graceful shutdown on SIGINT (Ctrl+C) or SIGTERM
let shutdownTimer = null;

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

// Function to read new unread threads, reply to the latest message, and label immediately after sending.
async function getNewThreads(auth, customLabelID) {
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.threads.list({
    userId: "me",
    q: "is:unread",
  });

  const threads = res.data.threads;

  if (!threads || threads.length === 0) {
    console.log("No new email threads...");
    return;
  }

  console.log(`Fetching ${threads.length} unread thread(s)...`);

  for (const thread of threads) {
    try {
      const threadID = thread.id;

      const threadDetail = await gmail.users.threads.get({
        userId: "me",
        id: threadID,
      });

      const messages = threadDetail.data.messages;

      if (!messages || messages.length === 0) {
        console.log(`No messages found in thread ${threadID}, skipping...`);
        continue;
      }

      // Check if the thread already has the custom label (already processed)
      const threadLabelIds = messages[0].labelIds || [];
      if (customLabelID && threadLabelIds.includes(customLabelID)) {
        console.log(`Thread ${threadID} already labeled as ${LABEL_NAME}, skipping...`);
        continue;
      }

      // Only process the last (newest) message in the thread
      const message = messages[messages.length - 1];
      const headers = message.payload.headers;

      const fromHeader = headers.find((header) => header.name === "From");
      const messageIDHeader = headers.find((header) => header.name === "Message-ID");
      const subjectHeader = headers.find((header) => header.name === "Subject");

      // Validate required headers — skip message gracefully if any are missing
      if (!fromHeader || !messageIDHeader || !subjectHeader) {
        console.warn(`Thread ${threadID}: Missing required headers, skipping...`);
        continue;
      }

      const inputString = fromHeader.value;
      const emailSender = getSenderEmail(inputString);

      // Skip if the sender is the authenticated user (prevent self-reply loop)
      if (emailSender.toLowerCase() === SENDER_EMAIL.toLowerCase()) {
        console.log(`Thread ${threadID}: Sender is self (${emailSender}), skipping...`);
        continue;
      }

      const angleIndex = inputString.indexOf("<");
      const nameString = angleIndex !== -1
        ? inputString.substring(0, angleIndex).trim()
        : emailSender;
      const messageID = messageIDHeader.value;
      const subject = subjectHeader.value;

      const sentMessageID = await sendEmail(
        auth,
        emailSender,
        threadID,
        messageID,
        subject,
        nameString
      );

      if (sentMessageID) {
        // Label the thread immediately after successfully sending the reply
        await applyLabelToThread(gmail, threadID, customLabelID);
      }

      console.log("---------------------------------------------------");
    } catch (err) {
      console.error(`Error processing thread ${thread.id}:`, err.message);
    }
  }
}

// Function to gather information regarding the email and send it back to the same thread.
async function sendEmail(
  auth,
  senderEmail,
  threadID,
  messageID,
  subject,
  nameString
) {
  const body = `Hey ${nameString}, Thank you for your message.`;

  const options = {
    to: senderEmail,
    from: SENDER_EMAIL,
    subject: subject,
    text: body,
    textEncoding: "base64",
    headers: [
      {
        key: "References",
        value: messageID,
      },
      {
        key: "In-Reply-To",
        value: messageID,
      },
      {
        key: "MIME-Version",
        value: "1.0",
      },
      {
        key: "Message-ID",
        value: messageID,
      },
      {
        key: "threadId",
        value: threadID,
      },
    ],
  };

  try {
    const sentMessageID = await send(auth, options, threadID);
    console.log(`Reply sent to ${senderEmail} (message ID: ${sentMessageID}).`);
    return sentMessageID;
  } catch (err) {
    console.error(`Failed to send reply to ${senderEmail}:`, err.message);
    return null;
  }
}

// Function to return base64 encoded string for raw message
const encodeMessage = (message) => {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

// Function to create email using nodemailer library
const createMail = async (options) => {
  const mailComposer = new MailComposer(options);
  const message = await mailComposer.compile().build();
  return encodeMessage(message);
};

// Function to send the email generated using Google APIs
async function send(auth, options, threadID) {
  const gmail = google.gmail({ version: "v1", auth });

  const rawMessage = await createMail(options);

  const { data: { id } = {} } = await gmail.users.messages.send({
    userId: "me",
    resource: {
      raw: rawMessage,
      threadId: threadID,
    },
  });
  return id;
}

// Function to extract email address of sender from incoming message header
function getSenderEmail(inputString) {
  const startIndex = inputString.indexOf("<");
  const endIndex = inputString.indexOf(">");
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return inputString.substring(startIndex + 1, endIndex);
  } else {
    // Assume the entire string is a bare email address
    return inputString.trim();
  }
}

// If custom label exists, it returns the label id. If it does not exist, it creates one and returns the label id.
async function createOrGetCustomLabel(auth) {
  const gmail = google.gmail({ version: "v1", auth });

  try {
    const labelsResponse = await gmail.users.labels.list({
      userId: "me",
    });

    const existingLabel = labelsResponse.data.labels.find(
      (label) => label.name === LABEL_NAME
    );

    if (existingLabel) {
      console.log(`Label "${LABEL_NAME}" already exists with ID: ${existingLabel.id}`);
      return existingLabel.id;
    } else {
      const createLabelResponse = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: LABEL_NAME,
          type: "user",
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });

      console.log(`Label "${LABEL_NAME}" created with ID: ${createLabelResponse.data.id}`);
      return createLabelResponse.data.id;
    }
  } catch (error) {
    console.error("Error creating or getting custom label:", error.message);
    return null;
  }
}

// Applies the custom label to a thread immediately after a reply is sent, and marks it as read.
async function applyLabelToThread(gmail, threadId, customLabelID) {
  if (!customLabelID) return;

  try {
    await gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: {
        addLabelIds: [customLabelID],
        removeLabelIds: ["UNREAD"],
      },
    });

    console.log(`Thread ${threadId} labeled as "${LABEL_NAME}" and marked as read.`);
  } catch (error) {
    console.error(`Error labeling thread ${threadId}:`, error.message);
  }
}

/*
Main function to authenticate and authorize the user.
After authorization, it fetches each new (unread) thread and sends a reply to the
latest message received. Once a reply is sent, the thread is immediately labeled
with the custom label and marked as read — preventing duplicate replies on the
next cycle.
If the custom label does not exist, it creates one.
*/
async function main() {
  try {
    const auth = await authorize();

    // Get or create the custom label before processing threads
    const customLabelID = await createOrGetCustomLabel(auth);

    await getNewThreads(auth, customLabelID);
  } catch (error) {
    console.error("Error running main cycle:", error.message);
  } finally {
    executionCount++;
    console.log(`Execution #${executionCount} completed.`);

    // Stop if we've reached the configured maximum number of executions
    if (MAX_EXECUTIONS > 0 && executionCount >= MAX_EXECUTIONS) {
      console.log(`Reached max executions (${MAX_EXECUTIONS}). Exiting.`);
      process.exit(0);
    }

    // Schedule the next execution after a random interval
    const randomInterval =
      Math.floor(Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1)) + MIN_INTERVAL;
    console.log(`Next execution in ${randomInterval} seconds.`);
    shutdownTimer = setTimeout(main, randomInterval * 1000);
  }
}

let executionCount = 0;

// Application entry point
main();
