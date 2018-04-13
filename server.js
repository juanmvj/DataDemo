var express = require("express"),
    app = express(),
    cfenv = require("cfenv"),
    skipper = require("skipper"),
    skipperS3 = require('skipper-s3'),
    extend = require('extend'),
    S3Lister = require("s3-lister");
    bodyParser = require('body-parser');
    Cloudant = require('@cloudant/cloudant');




var search = "ibm";
var twitter_count = 100;
var consumerKey = 'twitterKey';
var consumerSecret = 'twitterKey';
var cludant_username = ''
var cludant_password = ''
var cloudant = Cloudant({account:cludant_username, password:cludant_password});


//load Object Storage (S3) credentials
var s3config = null
try {
  s3config = require("./s3-credentials.json");
}
catch (e) {}

var appEnv = cfenv.getAppEnv();

app.use(express.static(__dirname + "/public"));
app.use(skipper());
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 


//fetch a single document from S3 storage
app.get("/files/:filename", function (request, response) {
    console.log(request.params.filename)
    var adapter = skipperS3(s3config);
    var readStream = adapter.read(request.params.filename);
    readStream.pipe(response);
});

//post to cloudant
app.post('/form-upload', function(req, res, next) {
    
    cloudant.db.list(function(err, allDbs) {
  console.log('All my databases: %s', allDbs.join(', '))
});

    var nom = cloudant.db.use('nom')

    nom.insert({ edad: req.body.age, sexo: req.body.sex }, req.body.username, function(err, body, header) {
      if (err) {
        return console.log('[nom.insert] ', err.message);
      }

      console.log('You have inserted into database.');
      console.log(body);
    });
            // console.log('Username: ' + req.body.username);
            // console.log('age: ' + req.body.age);
            // console.log('sex: ' + req.body.sex);
    res.send("enviado")
});

//list documents from S3 storage
app.get("/files", function (request, response) {
    var adapter = skipperS3(s3config);

    adapter.ls("/", function (error, files) {
        if (error) {
            console.log(error);
            response.send(error);
        }
        else {
            response.send(files);
        }
    });
});

//Twitter Get
app.get('/twitter', function (req, res) {
 
  var urltoken = "https://api.twitter.com/oauth2/token?grant_type=client_credentials";
  var options = {
    method: 'POST',
    url: urltoken,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Authorization': 'Basic ' + new Buffer(consumerKey + ":" + consumerSecret).toString('base64')  ,
      'oauth_callback':'http:localhost:' + appEnv.port + '/twitterALL'
    }
  };

  var reqtoken = require('request');
  reqtoken(options, function (error, response, body) {
    var token = JSON.parse(body).access_token;

    var urltweets = "https://api.twitter.com/1.1/search/tweets.json?q=%23" + search + "&count=" + twitter_count;
    var optionstweets = {
      method: 'GET',
      url: urltweets,
      headers: {
        'Authorization': 'Bearer ' + token,
        'oauth_callback':'http:localhost:' + appEnv.port + '/twitterALL'
      }
    };
    var reqtweets = require('request');
    reqtweets(optionstweets, function (error, response, body) {
      var data = JSON.parse(body).statuses;
        var jsonResponse = {
                tweets:[]
              };
              var i = 0;
              for(i = 0; i< data.length; i++)
              {
                if (data[i].in_reply_to_status_id ==null && data[i].retweeted_status == null){
                var t = data[i];
                var tweet = {
                  text: data[i].text,
                  date: data[i].created_at,
                  id: data[i].id,
                  user: data[i].user.screen_name
                };
                jsonResponse.tweets.push(tweet);}
              }

              //Guardar en Cloudant
            
              var nom = cloudant.db.use('twit')
              nom.insert(jsonResponse , function(err, body, header) {
              if (err) {
                return console.log('[twit.insert] ', err.message);
              }

              console.log('You have inserted into database.');
              console.log(body);
            });



              res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(jsonResponse));
    });

  });

});


//upload a document to S3 storage
app.post("/upload", function (request, response) {
    
    var file = request.file('file');
    var filename = file._files[0].stream.filename;
    var options = extend({}, s3config, {
        adapter: skipperS3,
        headers: {
            'x-amz-acl': 'private'
        },  
        saveAs: filename
    });

    file.upload(options, function (err, uploadedFiles) {
        if (err) {
            console.log(err);
            return response.send(err);
        }
        else {
            return response.redirect("/");
        }
    });
});




// if you do not set the default maxKeys value, you will get "400 Bad Request" errors from S3 when listing contents
S3Lister.prototype.__read = S3Lister.prototype._read;
S3Lister.prototype._read = function () { 
    this.options.maxKeys = 1000;
    S3Lister.prototype.__read.apply(this, arguments);
}





//start the app
var port = process.env.PORT || 8080;
app.listen(port, function() {
    console.log('listening on port', port);
});


require("cf-deployment-tracker-client").track();
