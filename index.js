const fs = require("fs").promises;
const path = require("path"); // Built-in module that provides utilities for working with file and directory paths.
const process = require("process"); // Global object that provides information and control over the current Node.js process.
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");
const MailComposer = require("nodemailer/lib/mail-composer"); // Nodemailer - NodeJS library to create email template for sending.
const { CLIENT_RENEG_LIMIT } = require("tls");

// If modifying these scopes, delete token.json.
// SCOPES are the authorization of the services given by google.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.modify",
];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

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
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
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
 * Load or request or authorization to call APIs.
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

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */

// Function to read the new threads and call to next function for sending email to that same thread.
async function getNewThreads(auth) {
  const gmail = google.gmail({ version: "v1", auth });

  const res = await gmail.users.threads.list({
    userId: "me",
    q: `is:unread from:${emailID} after:2024/01/14`,
  });

  const threads = res.data.threads;

  if (threads && threads.length > 0) {
    console.log("Fetching threads...");

    // console.log(threads);
    for (const thread of threads) {
      const threadID = thread.id;

      const threadDetail = await gmail.users.threads.get({
        userId: "me",
        id: threadID,
      });

      const messages = threadDetail.data.messages;

      if (messages && messages.length > 0) {
        messages.forEach((message) => {
          const headers = message.payload.headers;
          console.log(headers);

          let fromEmail = headers.find((header) => header.name === "From");
          console.log(fromEmail.value);
          let inputString = fromEmail.value;

          const nameString = inputString.substring(0, inputString.indexOf("<"));

          let emailSender = getSenderEmail(inputString);

          const messageIDObject = headers.find(
            (header) => header.name === "Message-ID"
          );
          const messageID = messageIDObject.value;

          const subjectObject = headers.find(
            (header) => header.name === "Subject"
          );
          const subject = subjectObject.value;

          console.log(emailSender);
          sendEmail(
            auth,
            emailSender,
            threadID,
            messageID,
            subject,
            nameString
          );
        });

        console.log("---------------------------------------------------");
      } else {
        console.log("No messages in the incoming thread...");
      }
    }
  } else {
    console.log("No new email threads...");
  }
}

// Function to gather information regarding email in an object to pass in the function to actually send email.
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
    to: `${senderEmail}`,
    from: `birajdarchinmay@gmail.com`,
    subject: `${subject}`,
    text: `${body}`,
    textEncoding: "base64",
    headers: [
      {
        key: "References",
        value: `${messageID}`,
      },
      {
        key: "In-Reply-To",
        value: `${messageID}`,
      },
      {
        key: "MIME-Version",
        value: "1.0",
      },
      {
        key: "Message-ID",
        value: `${messageID}`,
      },
      {
        key: "threadId",
        value: `${threadID}`,
      },
    ],
  };

  try {
    const sentMessageID = await send(auth, options, threadID);
    console.log(
      "Message of messageID: ",
      `${sentMessageID}`,
      " is successfully sent."
    );
  } catch (err) {
    console.log("Mail Not sent, Error is: ", err.message);
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

// Function to send the email generated using google apis
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
    return "No Email Sender...";
  }
}

// If custome label exists, it returns the label id to next function. But if it does not exists it will create one and send the label id.

async function createOrGetCustomLabel(auth) {
  const gmail = google.gmail({ version: "v1", auth });

  try {
    const labelsResponse = await gmail.users.labels.list({
      userId: "me",
    });

    const existingLabel = labelsResponse.data.labels.find(
      (label) => label.name === "AUTOMATED"
    );

    if (existingLabel) {
      console.log(
        `Label - (AUTOMATED) - already exists with ID: ${existingLabel.id}`
      );
      return existingLabel.id;
    } else {
      const createLabelResponse = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: "AUTOMATED",
          type: "user",
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });

      console.log(
        `Label Automated created with ID: ${createLabelResponse.data.id}`
      );
      return createLabelResponse.data.id;
    }
  } catch (error) {
    console.error("Error creating or getting custom label:", error.message);
    return null;
  }
}

// Function to name the custom label (AUTOMATED) to the sent email message.

async function labelRepliedEmails(auth, customLabelID) {
  const gmail = google.gmail({ version: "v1", auth });

  try {
    const threadsResponse = await gmail.users.threads.list({
      userId: "me",
      q: `is:unread from:${emailID} after:2024/01/14`,
    });

    const threads = threadsResponse.data.threads;

    if (threads && threads.length > 0) {
      console.log("Labeling replied emails:");

      for (const thread of threads) {
        const threadId = thread.id;

        // Check if the thread has the replied label already
        const threadDetailsResponse = await gmail.users.threads.get({
          userId: "me",
          id: threadId,
        });

        const labels = threadDetailsResponse.data.messages[0].labelIds;

        if (!labels.includes(customLabelID)) {
          // Label the thread with the custome name - AUTOMATED
          await gmail.users.threads.modify({
            userId: "me",
            id: threadId,
            requestBody: {
              addLabelIds: [customLabelID], // Label the mail as custom label name
              removeLabelIds: ["UNREAD"], // Remove labels from the thread
            },
          });

          console.log(`Thread ID ${threadId} labeled with Automated'.`);
        }
      }
    } else {
      console.log("No threads found.");
    }
  } catch (error) {
    console.error("Error labeling replied emails:", error.message);
  }
}

/*
Main function to authenticate and authorize the user.
After authorization, it creates email receieved for every new thread and sends it back to the same thread.
If the custom Label does not exist then it creates one. And if it exists then it just pushes the sent email to that thread.
*/

async function main() {
  try {
    const auth = await authorize();
    await getNewThreads(auth);

    // Get or create the replied label
    const customLabelID = await createOrGetCustomLabel(auth);

    if (customLabelID) {
      // Label replied emails with the custom label
      await labelRepliedEmails(auth, customLabelID);
    }
  } catch (error) {
    console.error("Error running code:", error.message);
  } finally {
    // Schedule the next execution after a random interval
    const randomInterval = Math.floor(Math.random() * (120 - 45 + 1)) + 45; // Random interval between 45 and 120 seconds
    console.log(`Next execution in ${randomInterval} seconds.`);
    setTimeout(main, randomInterval * 1000); // Convert seconds to milliseconds
    executionCount++;
  }
}

let executionCount = 0;
const emailID = "kapilbirajdar0@gmail.com";
// First of all main execution starts here
main();
