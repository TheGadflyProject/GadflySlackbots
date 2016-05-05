/**
 *
 */
var gapFillURL = "https://gadfly-api.herokuapp.com/gadfly/api/gap_fill_questions";
var mcqURL = "https://gadfly-api.herokuapp.com/gadfly/api/multiple_choice_questions";
var fs = require('fs');
var d = require('domain').create();
var async = require('async');
var schedule = require('node-schedule');
var request = require("request");


replies = {
    idk: new RegExp(/^(idk|not\ sure|i\ don\'t\ know|don\'t\ know')/i),
    stop: new RegExp(/^(stop|Stop|STOP)/i)
};

/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */
function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({user: installer}, function(err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say('I am a bot that has just joined your team');
                convo.say('You must now /invite me to a channel so that I can be of use!');
            }
        });
    }
}

/**
 * Configure the persistence options
 */
var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN)?'./db_slack_bot_ci/':'./db_slack_bot_a/'), //use a different name if an app or CI
    };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */
if (process.env.TOKEN || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
    var controller = customIntegration.configure(token, config, onInstallation);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment.')
    console.log('If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment')
    process.exit(1);
}

/*
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function(bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function(bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});

/* Automation for gathering top articles from NYT
and generating MCQ in json*/

var rule = new schedule.RecurrenceRule();
rule.dayOfWeek = [0, new schedule.Range(1, 6)];
// rule.hour = 15;
// rule.minute = 0;


var j = schedule.scheduleJob(rule, function(){
    var url1, url2, url3;
    request.get({
      url: "https://api.nytimes.com/svc/mostpopular/v2/mostemailed/all-sections/1.json",
      qs: {
        'api-key': "f5216a41176d45d5ab8904d74eb88d21"
      },
    }, function(err, response, body) {
      body = JSON.parse(body);
      url1 = body.results[0].url;
      url2 = body.results[1].url;
      url3 = body.results[2].url;
    })
});


/*
 * Core bot logic
 */
controller.hears('trivia', ['ambient'], function(bot, message) {
    async.series([
        function(callback) {postTriviaIntroduction(bot, message, callback);},
        function(callback) {waitNSecs(3000, callback);},
        function(callback) {addTrivia(bot, message, callback);},
        function(callback) {waitNSecs(700, callback);},
        function(callback) {addReactions(bot, message, callback);}
    ]);
});


// introduce yourself to the trivia crowd!
function postTriviaIntroduction(bot, message, callback) {
    var intro = 'Hi everyone <!here>, it\'s time to play some trivia! I\'ve picked a popular article for the day and will ask a question based off of it. You have an hour to respond, but I will be giving extra points for those first to answer :simple_smile:';
    bot.reply(message, intro);
    callback(null);
}

// ask the trivia question with the choices
function addTrivia(bot, message, callback) {
    var obj = JSON.parse(fs.readFileSync('twitter.json'));
    q = obj.questions;
    question = q.question;
    choices = q.answer_choices;
    currentChannel = message.channel;
    bot.reply(message,
        q.question + '\n\n' + ':one:\t' + choices[0] + '\n' + ':two:\t' + choices[1] + '\n' + ':three:\t' + choices[2] + '\n' + ':four:\t' + choices[3]);
    callback(null);
}

// use the slack api to locate the last message in the channel we are in right now
// then use the slack api to add reactions to that message
function addReactions(bot, message, callback) {
    var currentChannel = message.channel;
    bot.api.channels.history({
        channel: currentChannel,
        count: 1,
        inclusive: 1
    }, function(err, body) {
        if (err) {
            console.log(err);
        }
        lastMsg = body.messages[0];
        fs.writeFileSync('session.storage', lastMsg.ts, 'utf8');
        bot.api.reactions.add({
            timestamp: lastMsg.ts,
            channel: currentChannel,
            name: 'one'
        }, function() {
            bot.api.reactions.add({
                timestamp: lastMsg.ts,
                channel: currentChannel,
                name: 'two'
            }, function() {
                bot.api.reactions.add({
                    timestamp: lastMsg.ts,
                    channel: currentChannel,
                    name: 'three'
                }, function() {
                    bot.api.reactions.add({
                        timestamp: lastMsg.ts,
                        channel: currentChannel,
                        name: 'four'
                    });
                });
            });
        });
    });
    callback(null);
}

// utility function that waits n seconds; n passed as a parameter
function waitNSecs(n, callback) {
    setTimeout(function () {
      callback(null);
    }, n);
}

// much like a vampire, you must invite a bot into your channel
controller.on('bot_channel_join', function(bot, message) {
    bot.reply(message, "I'm here!")
});

// say hello
controller.hears(['hey', 'hello', 'hi', 'greetings', 'sup', 'yo'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
     bot.reply(message, 'Hi there! I\'m a bot. If you paste a news article URL in this channel, I can start asking you questions about it.');
 });

// stop
controller.hears(['stop', 'Stop', 'STOP', 'stahp', 'STAHP'],['direct_message','mention'], function(bot, message) {
    return bot.reply(message, 'I heard you loud and clear boss.');
});

// for personality
controller.hears(['who are you', 'are you a bot', 'what are you', 'what\'s your purpose', 'why are you here', 'what do you do'], ['direct_message','mention','direct_mention', 'ambient'], function(bot, message) {
    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err) {
        if (err) {
            console.log(err)
        }
        bot.reply(message, 'I\'m just a poor bot, I need no sympathy, Because I\'m easy come, easy go.');
    });
});
controller.hears('open the (.*) doors',['direct_message','mention'], function(bot, message) {
  var doorType = message.match[1]; //match[1] is the (.*) group. match[0] is the entire group (open the (.*) doors).
  if (doorType === 'pod bay') {
    return bot.reply(message, 'I\'m sorry, Dave. I\'m afraid I can\'t do that.');
  }
  return bot.reply(message, 'Okay');
});

// monitor reactions on the last message & log them to a file if they are not from the bot
controller.on('reaction_added', function(bot, message) {
    var targetMsg = fs.readFileSync('session.storage');
    if (message.user != bot.identity.id && message.item.ts == targetMsg) {
        fs.appendFile('reactions.json', JSON.stringify(message) + ',', function(err) {
            if (err) console.log(err);
        });
    }
});
