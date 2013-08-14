var
  util = require('util'),
  Browser = require('zombie'),
  express = require('express'),
  googleapis = require('googleapis'),
  settings = {
    server: {
      hostname: 'mktgdept.com',
      port: '5555'
    },
    google: {
      client_id: '000000000000.apps.googleusercontent.com',
      client_secret: 'bbbbbbbbbbbbbbbbbbbbbbbb'
    },
    simple: {
      username: 'username',
      passphrase: 'passphrase'
    }
  },
  template = function(amount) {
    return '<article><section><table class="text-large"><tbody><tr><td>Safe to Spend</td><td class="align-right">' + amount + '</td></tr></tbody></table></section><footer><p class="yellow">Simple</p></footer></article>';
  },
  OAuth2Client = googleapis.OAuth2Client,
  oauth2Client,
  app = express(),
  updateAccount = function(callback) {
    Browser.visit('https://bank.simple.com/signin', function(e, browser) {
      browser
        .fill('#login_username', settings.simple.username)
        .fill('#login_password', settings.simple.passphrase)
        .pressButton('#signin-btn', function() {
          callback(browser.text('#sts-flag'));
        });
    });
  };

app.configure(function() {
  app.use(express.bodyParser());
  app.use(express.static(__dirname + '/public'));
});

app.get('/', function(req, res) {
  if(!oauth2Client || !oauth2Client.credentials) {
    oauth2Client = new OAuth2Client(settings.google.client_id, settings.google.client_secret, 'http://' + settings.server.hostname + ':' + settings.server.port + '/oauth2callback');
    res.redirect(oauth2Client.generateAuthUrl({
      access_type: 'offline',
      approval_prompt: 'force',
      scope: [
        'https://www.googleapis.com/auth/glass.timeline',
        'https://www.googleapis.com/auth/userinfo.profile'
      ].join(' ')
    }));
  }
  else {
    googleapis.discover('mirror', 'v1').execute(function(err, client) {
      client.mirror.subscriptions.insert({
        callbackUrl: 'https://mirrornotifications.appspot.com/forward?url=http://' + settings.server.hostname + ':' + settings.server.port + '/subcallback',
        collection: 'timeline'
      }).withAuthClient(oauth2Client).execute(function(err, result) {
        console.log('mirror.subscriptions.insert', util.inspect(result));
      });
      updateAccount(function(amount) {
        client.mirror.timeline.insert({
          html: template(amount),
          menuItems: [
            {
              id: 'refresh',
              action: 'CUSTOM',
              values: [
                {
                  displayName: 'Refresh',
                  iconUrl: 'http://' + settings.server.hostname + ':' + settings.server.port + '/refresh.png'
                }
              ]
            },
            {
              action: 'TOGGLE_PINNED'
            },
            {
              action: 'DELETE'
            }
          ]
        }).withAuthClient(oauth2Client).execute(function(err, result) {
          console.log('mirror.timeline.insert', util.inspect(result));
        });
      });
    });
    res.send(200);
  }
});

app.get('/oauth2callback', function(req, res) {
  if(!oauth2Client) {
    res.redirect('/');
  }
  else {
    oauth2Client.getToken(req.query.code, function(err, tokens) {
      oauth2Client.credentials = tokens;
      res.redirect('/');
    });
  }
});

app.post('/subcallback', function(req, res) {
  res.send(200);
  console.log('/subcallback', util.inspect(req.body));
  if(req.body.operation == 'UPDATE' && req.body.userActions[0].type == 'CUSTOM')
    googleapis.discover('mirror', 'v1').execute(function(err, client) {
      updateAccount(function(amount) {
        client.mirror.timeline.patch({
          id: req.body.itemId
        }, {
          html: template(amount)
        }).withAuthClient(oauth2Client).execute(function(err, result) {
          console.log('mirror.timeline.patch', util.inspect(result));
        });
      });
    });
});

app.listen(settings.server.port);