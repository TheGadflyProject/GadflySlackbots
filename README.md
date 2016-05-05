# GadflySlackbots
Home of Slack bot users, QBot and TriviaBot, powered by the Gadfly Project.

## Bot Reference
### Basics

### QBot
This bot user provides news discovery based on user preferences. This bot user currently relies upon the gap fill question generation capability of The Gadfly Project. 

Users can interact with this bot to indicate their topics of interest e.g. Tech, Sports. They can also set time preferences for being notified. The bot user will then generate questions based on the top news articles in these topics and message individual users. 

The message includes a gap fill question generated from the body of a news article along with the URL. The bot user occasionally asks for feedback on the quality of question generated. 

### TriviaBot
This bot user simulates the experience of playing news based trivia. This bot user draws upon the multiple choice question generation capability of The Gadfly Project. At a specific time (which you can set reminders for), TriviaBot messages the #trivia channel with previously generated questions. These questions are based on specific themes that are human curated. 

The messages include a question text along with 4 answer choices. The bot user adds emoticons corresponding to the choices as reactions to the message. The players can respond to questions by clicking on these reactions. The bot maintains state by counting responses, tracking time of response and maintaining a leaderboard. 

At the end of a trivia session, the bot messages the channel with these stats. Usually, trivia sessions involve 4 questions and last 1 hour. 
