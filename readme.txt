
----------------------------------------------    PROJECT SETUP:    -----------------------------------------------------
-Follow the setup guideline given in this documentation - https://developers.google.com/gmail/api/quickstart/nodejs
-Download the credentials file from the above mentioned link and rename it as credentials.json

----------------------------------------------    Running the App:  -----------------------------------------------------
-Run app by executing command "node ." in the terminal.
-After running it will redirect you to the authentication page of google to sign into your google cloud workspace project. Select your email ID and login.
-A token will generate and it will reflect it in the project folder as token.js file.


----------------------------------------------  Miscellaneous Information:  -----------------------------------------------
The App will run after every random 45 to 120 seconds. Everytime it will catch the new email threads and reply to that threads with the custom generated message. 
After the mail sent to the same thread, it will be stored in the custom generated Label. If the label does not exist it will create it one.

Custom Label name - AUTOMATED

Nodemailer(NodeJS Library) is uned in the project for creating the email email. The created emails are then sent using gmail api by google.
