# homebridge-cognitive-identification
This plugin for [homebridge](https://github.com/nfarina/homebridge) uses [Microsoft Cognitive Services](https://www.microsoft.com/cognitive-services) to identify people by their faces which were detected on a snapped picture. It uses MotionDetected characteristic for notifying when a known person has been identified.

# Configuring Microsoft Cognitive Services
The plugin will only work with an existing and properly configure Cognitive Service account.
Before you install this plugin, make sure you have properly configured your Microsoft Cognitive Services account, provisioned it with at least a single person group and added some people to it. Also make sure persons in group have enough photos and that group is successfully trained.

**NOTE: please review your Microsoft Cognitive Services subscription as some limitation may be set on free subscriptions and if using paid subscription, be aware of your subscription costs!!!**

# Plugin installation

1. Make sure you have homebridge installed. If not, install it using `npm install -g homebridge`.
2. Install this plugin using `npm install -g homebridge-cognitive-identification`.
3. Update homebridge configuration file. See below for a sample.

# How it works
1. When plugin is started, it will query Microsoft Cognitive Services for a configured person group to get back the names of persons that are part of that group.
2. A motion sensor accessory will be created for each of those persons. The names are formed as "<person's name> on <sensor's name>", e.g. "Andrej on Intercom".
3. A HTTP server endpoint is created for each sensor, e.g. /intercom, /camerawest, /cameraeast, ...
4. When any of HTTP server endpoints is hit, the plugin calls a configured URL to take a camera snapshot.
5. Plugin sends the snapshot to Microsoft Cognitive Services for face detection.
6. If any faces are detected, plugin again queries Cognitive Services for face identification against a configured person group, e.g. "Family".
7. If any person is identified, a motion sensor for that person is triggered.

# How I use it

I'm monitoring my front yard IP intercom for identifying members of my family. 
When intercom detects motion, it pings this plugin.
Plugins calls intercom's snapshot url to retrieve current photo and send it to Cognitive Service for face detection and identification.
If any member of my family is identified, a motion sensor for that member is triggered, allowing further automation based on that sensor.

# Planned features
* Allow more sensors to be configured (currently only one)
* Add a "Face detected, but not identified" accessory
* Option to take more snapshots at a specified interval when HTTP server endpoint is hit instead of just one

# Configuration

```
"platforms": [
    {
      "platform": "CognitiveIdentification",
      "port": <port for HTTP server to listen on>, // e.g. 8088
      "cognitiveFaceApiKey": "<your Microsoft Cognitive Services *FACE* API key>",
      "sensors": [
        {
          "name": "<sensor name>", // e.g. "Intercom"
          "listenUrl": "<HTTP server url endpoint>", // e.g. intercom, HTTP endpoint in this case would be http://<homebridgeIP>:<8088>/intercom
          "personGroupId": "Microsoft Cognitive Service person group ID", // e.g. "family"
          "snapshotUrl": "<URL to your camera's snapshot endpoint>" // e.g.  "http://<cameraIP>/camera/snapshot"
        }
      ]
    }
  ]
```

# Notes
This is my first homebridge plugin and first ever node.js module as I come from a different part of developer world :) Code may contain errors and unusual practices, for which I'll try to fix as soon as I get more familiar with node.js development.
