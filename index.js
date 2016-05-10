/**
 * Constants and declarations
 */
var gapFillURL = "http://api.gadflyproject.com/api/gap_fill_questions"
var mcqURL = "http://gadfly-api.herokuapp.com/api/multiple_choice_questions"
var http = require('http');
var https = require('https');
var request = require('request');
var d = require('domain').create()

// A pattern library to match specific conversational constructs
replies = {
    idk: new RegExp(/^(idk|not sure|i don\'t know|don\'t know')/i),
    stop: new RegExp(/^(stop|Stop|STOP)/i),
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


/*
 * Core bot logic
 */
controller.on('bot_channel_join', function(bot, message) {
    bot.reply(message, "I'm here!")
});

controller.hears(['http(.*)'], ['ambient', 'direct_mention', 'mention', 'direct_message'], function(bot, message) {
    url = message.text.replace("<", "").replace(">", "")
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
                callGadflyMCQ(url, convo, bot)
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

controller.hears(['more', 'next', 'bring it on'], ['direct_mention', 'mention', 'direct_message'], function(bot, message) {
    bot.startConversation(message, function(err, convo) {
        convo.ask('Ready?', [
        {
            pattern: bot.utterances.yes,
            callback: function(response, convo) {
                convo.say('Alright!')
                callGadflyMCQ(url, convo, bot)
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

// call the gadfly web api to get gap fill questions from the user input article.
// randomize the question to be asked using getRandomInt & push it to the conversation
function callGadflyGapFill (url, convo, bot) {
    var apiURL = gapFillURL + "?url=" + url;
    d.on('error', function(err) {
        convo.say('Uh oh! Hang on, something went wrong behind the scenes.')
        convo.say('I\'m just a bot so I don\'t know what went wrong. But I\'m pretty sure people will fix it.')
        convo.next()
        console.log(err.stack)
    });
    d.run(function() {
        request(apiURL, function(e, r, b) {
        if (e) { console.log(e); callback(true); return; }
        obj = JSON.parse(b)
        questions = obj['questions']
        index = getRandomInt(obj['num_questions'])
        q = questions[index]
        convo.next();
        max_attempt = 0;
        convo.ask(q.question_text, [
        {
            pattern: q.correct_answer,
            callback: function(response, convo) {
                msg = {}
                currentChannel = convo.source_message.channel;
                convo.say('That is correct! :100: Say more and mention me to get more questions.');
                bot.say({
                    text: 'Click on the :thumbsup: if you liked this question or the :thumbsdown: if you think this question needs improvement.',
                    channel: currentChannel
                });
                if (currentChannel[0] == 'G') {
                    botIsInAGroup(bot, currentChannel);
                }
                if (currentChannel[0] == 'D') {
                    botIsInADM(bot, currentChannel);
                }
                if (currentChannel[0] == 'C') {
                    botIsInAChannel(bot, currentChannel);
                }
                convo.next();
            }
        },
        {
            pattern: replies.idk,
            callback: function(response, convo) {
                convo.say('That\'s okay! If you want, you can read the article here' + ' ' + url);
                convo.next();
            }
        },
        {
            pattern: replies.stop,
            callback: function(response, convo) {
                convo.say('I heard you loud and clear boss.');
                convo.next();
            }
        },
        {
            default: true,
            callback: function(response, convo) {
                max_attempt++;
                msg = {}
                currentChannel = convo.source_message.channel;
                convo.say('Whoops! That is incorrect. :frowning:');
                if (currentChannel[0] == 'G') {
                    botIsInAGroup(bot, currentChannel);
                }
                if (currentChannel[0] == 'D') {
                    botIsInADM(bot, currentChannel);
                }
                if (currentChannel[0] == 'C') {
                    botIsInAChannel(bot, currentChannel);
                }
                if (max_attempt < 3) {
                    convo.repeat();
                    convo.next();
                } else {
                    convo.say('That\'s okay! If you want, you can read the article here' + ' ' + url);
                    convo.next();
                }
            }
        }
        ]);
    });
    });
};

// call the gadfly web api to get multiple choice questions from the user input article.
// randomize the question to be asked using getRandomInt & push it to the conversation
function callGadflyMCQ(url, convo, bot) {
    var apiURL = mcqURL + "?url=" + url;
    d.on('error', function(err) {
        convo.say('Uh oh! Hang on, something went wrong behind the scenes.')
        convo.say('I\'m just a bot so I don\'t know what went wrong. But I\'m pretty sure people will fix it.')
        convo.next()
        console.log(err.stack)
    });
    d.run(function() {
        request(apiURL, function(e, r, b) {
        if (e) { console.log(e); callback(true); return; }
        obj = JSON.parse(b)
        questions = obj['questions']
        index = getRandomInt(obj['num_questions'])
        q = questions[index]
        choices = q.answer_choices
        convo.next();
        convo.ask(q.question + '\n\n' + ':one:\t' + choices[0] + '\n' + ':two:\t' + choices[1] + '\n' + ':three:\t' + choices[2] + '\n' + ':four:\t' + choices[3], [
        {
            pattern: q.answer,
            callback: function(response, convo) {
                msg = {}
                currentChannel = convo.source_message.channel;
                bot.say({text:'That is correct! :100: Say more and mention me to get more questions.',channel:currentChannel});
                if (currentChannel[0] == 'G') {
                    botIsInAGroup(bot, currentChannel);
                }
                if (currentChannel[0] == 'D') {
                    botIsInADM(bot, currentChannel);
                }
                if (currentChannel[0] == 'C') {
                    botIsInAChannel(bot, currentChannel);
                }
                bot.say({
                    text: 'Click on the :thumbsup: if you liked this question or the :thumbsdown: if you think this question needs improvement.',
                    channel: currentChannel
                });
                convo.next();
            }
        },
        {
            pattern: replies.idk,
            callback: function(response, convo) {
                convo.say('That\'s okay! If you want, you can read the article here' + ' ' + url);
                convo.next();
            }
        },
        {
            pattern: replies.stop,
            callback: function(response, convo) {
                convo.say('I heard you loud and clear boss.');
                convo.next();
            }
        },
        {
            default: true,
            callback: function(response, convo) {
                msg = {}
                currentChannel = convo.source_message.channel;
                convo.say('Whoops! That is incorrect. :frowning:');
                if (currentChannel[0] == 'G') {
                    botIsInAGroup(bot, currentChannel);
                }
                if (currentChannel[0] == 'D') {
                    botIsInADM(bot, currentChannel);
                }
                if (currentChannel[0] == 'C') {
                    botIsInAChannel(bot, currentChannel);
                }
                convo.repeat();
                convo.next();
            }
        }
        ]);
    });
    });
};

// if the bot is in a group
function botIsInAGroup(bot, currentChannel) {
    bot.api.groups.history({
        channel: currentChannel,
        count: 1,
        inclusive: 1
    }, function (err, body) {
        if (err) {
            console.log(err);
        }
        bot.api.reactions.add({
            timestamp: body.messages[0].ts,
            channel: currentChannel,
            name: 'thumbsup'
        });
        bot.api.reactions.add({
            timestamp: body.messages[0].ts,
            channel: currentChannel,
            name: 'thumbsdown'
        });
    });
}

// if the bot is in a dm
function botIsInADM(bot, currentChannel) {
    bot.api.im.history({
        channel: currentChannel,
        count: 1,
        inclusive: 1
    }, function (err, body) {
        if (err) {
            console.log(err);
        }
        bot.api.reactions.add({
            timestamp: body.messages[0].ts,
            channel: currentChannel,
            name: 'thumbsup'
        });
        bot.api.reactions.add({
            timestamp: body.messages[0].ts,
            channel: currentChannel,
            name: 'thumbsdown'
        });
    });
}

// if the bot is in a channel
function botIsInAChannel(bot, currentChannel) {
    bot.api.channels.history({
        channel: currentChannel,
        count: 1,
        inclusive: 1
    }, function (err, body) {
        if (err) {
            console.log(err);
        }
        bot.api.reactions.add({
            timestamp: body.messages[0].ts,
            channel: currentChannel,
            name: 'thumbsup'
        });
        bot.api.reactions.add({
            timestamp: body.messages[0].ts,
            channel: currentChannel,
            name: 'thumbsdown'
        });
    });
}

// get random integers between 0-12
function getRandomInt(range) {
    return Math.floor(Math.random() * range);
}

// stop
controller.hears(['stop', 'Stop', 'STOP', 'stahp', 'STAHP'],['direct_message','mention'], function(bot, message) {
    return bot.reply(message, 'I heard you loud and clear boss.');
});

// for personality
controller.hears(['who are you', 'are you a bot', 'what are you'], ['direct_message','mention','direct_mention'], function(bot, message) {
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

//monitor reactions
controller.on('reaction_added', function(bot, message) {
    console.log(message.reaction);
    console.log(message.user);
})

// all un-handled direct mentions get a reaction and a pat response!
controller.on('direct_message, mention, direct_mention', function(bot, message) {
    bot.reply(message, 'Hi there! I\'m a bot. If you paste a news article URL here, I can ask you questions about it.');
});