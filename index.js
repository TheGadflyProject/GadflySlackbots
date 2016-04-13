/**
 *
 */
var baseURL = "https://gadfly-api.herokuapp.com/gadfly/api/v1.0/questions"
var http = require('http');
var https = require('https');
var request = require('request');
var fs = require('fs');

/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */
function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({user: installer}, function (err, convo) {
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
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});


/*
 * Core bot logic
 */
controller.on('bot_channel_join', function (bot, message) {
    bot.reply(message, "I'm here!")
});

controller.hears(['hello', 'hi', 'greetings'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
     bot.reply(message, 'Hello!');
 });

controller.hears(['http(.*)'], ['ambient', 'direct_mention', 'mention', 'direct_message'], function(bot, message) {
    global.url = message.text.replace("<", "").replace(">", "")
    /*getQuestions(url);*/
    bot.startConversation(message, function(err, convo) {
        convo.ask('I see you posted a link. Would you like to be quizzed on it?', [
        {
            pattern: bot.utterances.no,
            callback: function(response, convo) {
                convo.say('Perhaps later.')
                convo.next();
            }
        },
        {
            pattern: bot.utterances.yes,
            callback: function(response, convo) {
                convo.say('Cool, you said: ' + response.text);
                getQuestions(response, convo);
                convo.next();
            }
        },
        {
            default: true,
            callback: function(response, convo) {
                convo.repeat();
                convo.next();
            }
        }
        ]);
    })
});

// call gadfly
getQuestions = function(response, convo) {
    var apiURL = baseURL + "?url=" + url;
    var data = '';
    https.get(apiURL, function(r) {
        r.on('data', function(chunk) {
            data += chunk;
        });
        r.on('end', function(r) {
            obj = JSON.parse(data)
            questions = obj['questions']
            index = getRandomInt()
            q = questions[index]
        });
    });
/*    convo.ask('?', [
    {
        pattern: q.answer,
        callback: function(response, convo) {
            convo.say('That is correct! :100:');
        }
    },
    {
        default: false,
        callback: function(err, convo) {
            convo.repeat();
            convo.next();
        }
    }
    ]);*/
}

controller.hears(['more', 'next question', 'bring it on', 'next'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    bot.startConversation(message, function(err, convo) {
        convo.ask('Ready?', [
        {
            pattern: bot.utterances.yes,
            callback: function(response, convo) {
                convo.say('Alright!')
                askQuestions(response, convo)
                convo.next();
            }
        },
        {
            pattern: bot.utterances.no,
            callback: function(response,convo) {
                convo.say('Okay, ready when you are.')
                convo.next();
            }
        }
        ]);
    });
});

function getRandomInt() {
    return Math.floor(Math.random() * 12);
}

askQuestions = function(response, convo) {
    fs.readFile('C:/iolab/gadfly/easy-peasy-bot/twitter.json', 'utf8', function(err, data) {
        if (err) throw err;
        var obj = JSON.parse(data);
        questions = obj['questions']
        index = getRandomInt()
        q = questions[index];
        convo.ask(q.question, function(response, convo) {
            if (response.text == q.answer) {
                convo.say('That is correct! :100:');
            } else {
                convo.say('Whoops! That is incorrect. :frowning:');
                convo.repeat();
            }
            convo.next();
        });
    });
    //var apiURL = baseURL + "?url=" + url;
    //request({method: 'GET', uri: apiURL, json: true}, function(error, response, body) {
        //data = body['questions']
        //convo.ask(data[1].question, function(response, convo) {
          //  if (response.text == data[1].answer) {
            //    convo.say('That is correct! :100:')
  //          } else {
    //            convo.say('Whoops! That is incorrect! :frowning:')
      //      }
        //    convo.repeat();
          //  convo.next();
       // });
   // });
}

// for personality
controller.hears('open the (.*) doors',['direct_message','mention'], function(bot, message) {
  var doorType = message.match[1]; //match[1] is the (.*) group. match[0] is the entire group (open the (.*) doors).
  if (doorType === 'pod bay') {
    return bot.reply(message, 'I\'m sorry, Dave. I\'m afraid I can\'t do that.');
  }
  return bot.reply(message, 'Okay');
});

// stop
controller.hears(['stop', 'Stop', 'STOP'],['direct_message','mention'], function(bot, message) {
    return bot.reply(message, 'I heard you loud and clear boss.');
});

// all un-handled direct mentions get a reaction and a pat response!
controller.on('direct_message, mention, direct_mention', function (bot, message) {
   bot.api.reactions.add({
       timestamp: message.ts,
       channel: message.channel,
       name: 'robot_face',
   }, function (err) {
       if (err) {
           console.log(err)
       }
       bot.reply(message, 'I\'m just a poor bot, I need no sympathy, Because I\'m easy come, easy go.');
   });
});

// get reactions
controller.on('ambient', function(bot, message) {
    bot.api.reactions.get()
});
