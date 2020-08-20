function BackgroundObject() {
    this.messageAllowList_ = ["https://meet.google.com", "https://calendar.google.com", "http://bettermeetings.com"];
    this.dataProcessor_ = new DataProcessor();
}

/***********************/
/** Private functions **/
/***********************/
BackgroundObject.prototype.createObjectStoreAndDefaultValueAndKeyPath_ = 
    function(objectStoreName, saveKey, defaultValue, keyPath, callback) { 

    var dataProcessorObjectStoreCreatedCallback = function() {
        if(saveKey != null) {
            this.dataProcessor_.getValueForKeyFromObjectStore(saveKey, objectStoreName, function(result) {
                if(result != null) {
                    // Ignore default value if it entry already exists
                    callback(result);
                } else if(defaultValue != null) {
                    // Add default value if it doesn't exist
                    this.dataProcessor_.addValueToObjectStore(defaultValue, objectStoreName);
                }
                callback(defaultValue);
            }.bind(this));
        } else {
            callback();
        }
    }.bind(this);

    this.dataProcessor_.initWithObjectStoreAndKeyPath(objectStoreName, keyPath
        , dataProcessorObjectStoreCreatedCallback);
}

BackgroundObject.prototype.updateValueInObjectStore_ = function(value, objectStoreName, callback) {
    var successCallback = function(e) {
        console.log("updateValueInObjectStore_ successful");
        callback();
    }.bind(this);
    var failureCallback = function(e) {
        console.log("updateValueInObjectStore_ failure");
        console.warn(e);
        callback();
    }.bind(this)
    
    this.dataProcessor_.updateValueInObjectStore(value, objectStoreName, successCallback, failureCallback);
}

BackgroundObject.prototype.getValueForKeyFromObjectStore_ = function(key, objectStoreName, callback) {
    this.dataProcessor_.getValueForKeyFromObjectStore(key, objectStoreName, function(result) {
        callback(result);
    });
}

BackgroundObject.prototype.getAllFromObjectStore_ = function(objectStoreName, callback) {
    this.dataProcessor_.getAllFromObjectStore(objectStoreName, function(result) {
        callback(result);
    });
}

BackgroundObject.prototype.onMessage_ = function (request, sender, callback) {
    if(!this.messageAllowList_.includes(sender.origin) && sender.origin.indexOf("chrome-extension://") === -1) {
        console.warn("allow list does not match " + sender.origin);
    } else if(request && request.command) {
        switch(request.command) {
            case "createObjectStore":
                this.createObjectStoreAndDefaultValueAndKeyPath_(request.objectStoreName, request.saveKey, 
                    request.defaultValue, request.keyPath, callback);
                break;
            case "updateValueInObjectStore":
                this.updateValueInObjectStore_(request.value, request.objectStoreName, callback);
                break;
            case "getValueForKeyFromObjectStore":
                this.getValueForKeyFromObjectStore_(request.key, request.objectStoreName, callback);
                break;
            case "getAllFromObjectStore":
                this.getAllFromObjectStore_(request.objectStoreName, callback);
                break;
            case "registerAnalyticsPageView":
                ga('send', 'pageview', request.pageName);
                break;
            case "registerAnalyticsEvent":
                if(request.eventValue == null) {
                    ga('send', 'event', request.eventCategory, request.eventAction, request.eventLabel);
                }
                else {
                    ga('send', 'event', request.eventCategory, request.eventAction, request.eventLabel, request.eventValue);
                }
                break;
        }
    }

    // Callback will be async (https://developer.chrome.com/apps/messaging)
    return true;
}

window.BackgroundObject = new BackgroundObject();


// To capture history navigation on gCal page
// TODO: https://trello.com/c/EATwxikM/34-fix-onhistorystateupdated-trigger-for-going-from-edit-to-main-cal 
chrome.webNavigation.onHistoryStateUpdated.addListener(function (event) {
    if(event.transitionType === "link" && event.url.indexOf("https://calendar.google.com/calendar") !== -1) {
        if(event.url.indexOf("eventedit") !== -1) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                var activeTab = tabs[0];
                chrome.tabs.sendMessage(activeTab.id, {"message": "calendar_edit"});
            });
        }

        if(event.url.indexOf("eventedit") === -1) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                var activeTab = tabs[0];
                chrome.tabs.sendMessage(activeTab.id, {"message": "calendar_edit_exit"});
            });
        }
    }
});

// Open meeting logs when extension is clicked
chrome.browserAction.onClicked.addListener(function() {
  chrome.tabs.create({url: 'html/index.html'});
});

// To enable IndexDB to be stored in plugin rather than page context
chrome.runtime.onMessage.addListener(window.BackgroundObject.onMessage_.bind(window.BackgroundObject));