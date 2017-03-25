var Service;
var Characteristic;
var HomebridgeAPI;

var http = require('http');
var request = require("request");
var Stream = require('stream');

const conf = {
    DETECT_API_ENDPOINT: 'https://westus.api.cognitive.microsoft.com/face/v1.0/detect?returnFaceId=true',
    IDENTIFY_API_ENDPOINT: 'https://westus.api.cognitive.microsoft.com/face/v1.0/identify',
    PERSONS_API_ENDPOINT: 'https://westus.api.cognitive.microsoft.com/face/v1.0/persongroups',
}

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;

    homebridge.registerPlatform("homebridge-cognitive-identification", "CognitiveIdentification", CognitiveIdentificationPlatform);
};

//
// CognitiveIdentificationPlatform
//
function CognitiveIdentificationPlatform(log, config) {
    this.log = log;
    this.name = config.name;
    this.port = config.port;
    this.cognitiveFaceApiKey = config.cognitiveFaceApiKey;
    this.sensors = config.sensors;
}

CognitiveIdentificationPlatform.prototype = {
    accessories: function (callback) {
        this.log("Fetching CognitiveIdentificationPlatform devices.");

        this.sensor = this.sensors[0];

        request.get({
            url: conf.PERSONS_API_ENDPOINT + '/' + this.sensor.personGroupId + '/persons',
            headers: {
                'Ocp-Apim-Subscription-Key': this.cognitiveFaceApiKey,
            }
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var persons = JSON.parse(body);

                this.cognitiveAccessories = [];
                for (var i = 0; i < persons.length; i++) {
                    var accessory = new CognitiveIdentificationAccessory(this.log, persons[i], this.sensor, this);
                    this.cognitiveAccessories.push(accessory);
                }
                callback(this.cognitiveAccessories);
            }
        }.bind(this));

        this.server = http.createServer(function (request, response) {
            if (request.url == "/" + this.sensor.listenUrl) {
                this.httpHandler();
                response.writeHead(200, { 'Content-Type': 'text/plain' });
            }
            response.end('OK ' + request.url);
        }.bind(this));
        this.server.listen(this.port, function () {
            this.log("Cognitive Motion server is listening on port %s", this.port);
        }.bind(this));
    }
};

CognitiveIdentificationPlatform.prototype.httpHandler = function() {
    this.log("HTTP endpoint hit!");

    request.defaults({ encoding: null }).get({
        url: this.sensor.snapshotUrl,
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var base64Buffer = new Buffer(body, "base64");
            var binaryBuffer = new Buffer(base64Buffer.toString("binary"), "binary");
            var bufferStream = new Stream.PassThrough();
            bufferStream.end(binaryBuffer);

            bufferStream.pipe(request(
                {
                    url: conf.DETECT_API_ENDPOINT,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': binaryBuffer.length,
                        'Ocp-Apim-Subscription-Key': this.cognitiveFaceApiKey,
                    }
                }, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        this.handleDetectResponse(body);
                    }
                    else {
                        this.log("Error getting response (status code %s): %s", response.statusCode, error);
                    }
                }.bind(this)));
        }
        else {
            this.log("Error getting response (status code %s): %s", response.statusCode, error);
        }
    }.bind(this));
};

CognitiveIdentificationPlatform.prototype.handleDetectResponse = function (body) {
    var faces = JSON.parse(body);
    if (faces.length == 0) {
        return;
    }

    var face = faces[0];
    var faceId = face.faceId;

    var body = JSON.stringify({
        "personGroupId": this.sensor.personGroupId,
        "faceIds": [
            faceId,
        ],
        "maxNumOfCandidatesReturned": 1,
        "confidenceThreshold": 0.1
    });

    request({
        url: conf.IDENTIFY_API_ENDPOINT,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
            'Ocp-Apim-Subscription-Key': this.cognitiveFaceApiKey,
        },
        body: body
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            this.handleIdentifyResponse(body);
        }
        else {
            this.log("Error getting response (status code %s): %s", response.statusCode, error);
        }
    }.bind(this));
}

CognitiveIdentificationPlatform.prototype.handleIdentifyResponse = function (body) {
    var identifyResponse = JSON.parse(body);
    if (identifyResponse.length == 0) {
        // TODO fire 'unidentified person accessory'
    }
    else {
        var identification = identifyResponse[0];
        for (var i = 0; i < identification.candidates.length; i++) {
            for (var j = 0; j < this.cognitiveAccessories.length; j++) {
                var accessory = this.cognitiveAccessories[j];
                if (identification.candidates[i].personId == accessory.personId) {
                    this.log('%s identified!', accessory.name);
                    accessory.triggerMotion();
                    break;
                }
            }
        }
    }
}

//
// CognitiveIdentificationAccessory
//
function CognitiveIdentificationAccessory(log, person, sensor, platform) {
    this.log = log;
    this.name = person.name + " on " + platform.sensor.name;
    this.personId = person.personId;
    this.platform = platform;
    this.sensor = platform.sensor;
    this.motionDetected = false;
    this.timeout = null;

    this.log("Creating sensor %s", this.name);

    this.service = new Service.MotionSensor(this.name);
    this.service.getCharacteristic(Characteristic.MotionDetected)
        .on('get', this.getState.bind(this));
}

CognitiveIdentificationAccessory.prototype.getState = function (callback) {
    callback(null, this.motionDetected);
};

CognitiveIdentificationAccessory.prototype.triggerMotion = function () {
    this.motionDetected = true;
    this.service.getCharacteristic(Characteristic.MotionDetected)
        .updateValue(this.motionDetected, null, "cognitiveIdentification");

    if (this.timeout) clearTimeout(this.timeout);

    this.timeout = setTimeout(function () {
        this.motionDetected = false;
        this.service.getCharacteristic(Characteristic.MotionDetected)
           .updateValue(this.motionDetected, null, "cognitiveIdentification");
        this.timeout = null;
    }.bind(this), 15000); // TODO move "time to timeout" to configuration
}

CognitiveIdentificationAccessory.prototype.getServices = function () {
    return [this.service];
};