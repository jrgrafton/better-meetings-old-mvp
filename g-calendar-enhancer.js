function GCalendarEnhancer() {
    this.observerConfig_ = { attributes: false, childList: true, subtree: true };
    this.observerCalendarEdit_ = new MutationObserver(this.observeCalendarEditDOMModified_.bind(this));
    this.observerMeetingDetailsOverlay_ = new MutationObserver(this.observeMeetingDetailsOverlayModified_.bind(this));
    this.observerMeetDetailsAdded_ = new MutationObserver(this.observerMeetDetailsAdded_.bind(this));

    this.selectedTemplate_ = "custom";
    this.currentMeetingID_ = "";
    this.currentMeetingDetails_ = null;

    this.templates_ = {
        "_template_select" : "",
        "preamble" : "",
        "alignment": "",
        "broadcast": "",
        "decision": "",
        "11": "",
        "custom": ""
    }

    // Used for save data
    this.meetingObjectStoreName_ = "g-meet-enhancer";
    this.meetingObjectStoreKeyPath_ = "meetingSaveID";

    this.init_();
}

/***********************/
/** Public functions **/
/***********************/
GCalendarEnhancer.prototype.injectTemplateSelection = function() {
    // Store current MeetingID
    this.setCurrentMeetingID(window.location.href.split("/").slice(-1).pop().split("?")[0]);

    // Ensure that we only have one template select
    var existingSelect = document.querySelector("#template-select");
    if(existingSelect != null) {
        existingSelect.remove();
    }
    document.querySelector(".FrSOzf.tdXRXb").insertAdjacentHTML("beforebegin", this.templates_["_template_select"]);
    document.querySelector("#template-dropdown").addEventListener("click", this.templateSelected_.bind(this));

    // Select alignment template by default if new 
    if(document.querySelector("div[g_editable=true]").textContent.length === 0 && document.querySelector("#xTiIn").value.length === 0) {
        this.populateDescriptionWithTemplate_("alignment");
        this.selectedTemplate_ = "alignment";
    } else {
        this.updateSelectedTemplate_();
    }

    // Ensure we save save template selection when "save" is clicked
    this.injectTemplateSave_()
}

GCalendarEnhancer.prototype.setCurrentMeetingID = function(currentMeetingID) {
    this.currentMeetingID_ = currentMeetingID;
}

GCalendarEnhancer.prototype.getCalendarEditObserver = function() {
    return this.observerCalendarEdit_;
}

GCalendarEnhancer.prototype.getObserverConfig = function() {
    return this.observerConfig_;
}

/***********************/
/** Private functions **/
/***********************/
GCalendarEnhancer.prototype.init_ = function() {
    // Load all meeting templates
    this.loadTemplate_("_template_select", "template-select.html");
    this.loadTemplate_("preamble", "preamble.html");
    this.loadTemplate_("alignment", "alignment.html");
    this.loadTemplate_("broadcast", "broadcast.html");
    this.loadTemplate_("decision", "decision.html");
    this.loadTemplate_("11", "11.html");
    this.loadTemplate_("custom", "custom.html");

    // Inject templates if loading into eventedit page
    if(window.location.href.indexOf("eventedit") !== -1) {
        // Loaded into edit event view
        if(this.calendarEntryHasLoaded_()) {
            this.injectTemplateSelection();
        } else {
            this.observerCalendarEdit_.observe(document.body, this.observerConfig_);
        }
    }

    // Initialize DB and create ObjectStore (if it doesn't already exist)
    var backgroundRequest = {
        command: "createObjectStore",
        objectStoreName: this.meetingObjectStoreName_,
        keyPath: this.meetingObjectStoreKeyPath_
    }
    chrome.runtime.sendMessage(backgroundRequest, function() {});

    // Observe meeting details popup to capture potential meeting join
    this.observerMeetingDetailsOverlay_.observe(document.querySelector('#yDmH0d'), this.observerConfig_);
}

GCalendarEnhancer.prototype.loadTemplate_ = function(key, filename) {
    var GCalendarEnhancer = this;
    return fetch(chrome.extension.getURL('template/gcal/' + filename)).then(function(response) {
        response.text().then(function (text) {
            GCalendarEnhancer.templates_[key] = text
        });
    });
}

GCalendarEnhancer.prototype.injectTemplateSave_ = function() {
    document.querySelector("#xSaveBu").removeEventListener("click", this.saveTemplateSelection_.bind(this));
    document.querySelector("#xSaveBu").addEventListener("click", this.saveTemplateSelection_.bind(this));
}

GCalendarEnhancer.prototype.saveTemplateSelection_ = function() {
    var saveData = {};
    saveData[this.currentMeetingID_] = this.selectedTemplate_;
    chrome.storage.sync.set(saveData, function() {});
}

GCalendarEnhancer.prototype.updateSelectedTemplate_ = function() {
    this.getExistingTemplate_(document.querySelector("#xDescIn"), function (meetingTemplateName) {
        // Unselect default
        var defaultTemplate = document.querySelector("#template-value [aria-selected=true]");
        defaultTemplate.setAttribute("aria-selected", "false");
        defaultTemplate.setAttribute("tab-index", "-1");
        defaultTemplate.classList.remove("KKjvXb");
        defaultTemplate.firstElementChild.classList.remove("ziS7vd");

        // Select correct item
        var targetTemplate = 
            document.querySelector("#template-value [data-template-select='" + meetingTemplateName + "']");
        targetTemplate.setAttribute("aria-selected", "true");
        targetTemplate.setAttribute("tab-index", "0");
        targetTemplate.classList.add("KKjvXb");
        targetTemplate.firstElementChild.classList.add("ziS7vd");

        // Store template name
        this.selectedTemplate_ = meetingTemplateName;
    });
}

GCalendarEnhancer.prototype.getExistingTemplate_ = function(descriptionElement, callback) {
    var storageCallback = function(result) {
        // First fetch from storage
        var meetingTemplateName = (Object.keys(result).length === 0) ? "custom" : result[this.currentMeetingID_];

        // Second, try and guess from existing template
        var existingText = (descriptionElement)? descriptionElement.innerText : null;
        if(meetingTemplateName === "custom" && existingText && existingText.split("Meeting Type").length !== 1) {
            meetingTemplateName = 
                existingText.split("Meeting Type")[1].split("\n")[1].toLowerCase().replace(/\t| /g,'');
            meetingTemplateName = (Object.keys(this.templates_).includes(meetingTemplateName))? 
                meetingTemplateName : "custom";
        }

        callback(meetingTemplateName);
    }.bind(this);

    if(this.currentMeetingID_ !== null) {
        chrome.storage.sync.get([this.currentMeetingID_], storageCallback);
    }
    else {
        storageCallback({});
    }
}

GCalendarEnhancer.prototype.calendarEntryHasLoaded_ = function() {
    return document.querySelector("div[g_editable=true]") !== null && document.querySelector('#xRTCIn') != null;
}

GCalendarEnhancer.prototype.meetButtonExists_ = function() {
    return (document.querySelector("div[data-meet-url] a") !== null ||
        (document.querySelector("#xDetDlgVideo") && document.querySelector("#xDetDlgVideo").innerText.indexOf("Google Meet")  !== -1));
}

GCalendarEnhancer.prototype.getMeetButton_ = function() {
    var meetButton = document.querySelector("div[data-meet-url] a");
    if(meetButton == null && document.querySelector("#xDetDlgVideo") != null) {
        meetButton = document.querySelector("#xDetDlgVideo").querySelector("a");
    }

    return meetButton;
}

GCalendarEnhancer.prototype.observeMeetButtonClicked_ = function(meetButton) {
    meetButton.onclick = function() {
        this.getMeetingDetailsFromDOM_(function(meetingDetails) {
            this.currentMeetingDetails_ = meetingDetails;
            this.handleGMeetButtonClicked_();
        }.bind(this));
    }.bind(this);
}

GCalendarEnhancer.prototype.observerMeetDetailsAdded_ = function() {
    if(this.meetButtonExists_()) {
        this.observeMeetButtonClicked_(this.getMeetButton_());
    }
}

GCalendarEnhancer.prototype.observeCalendarEditDOMModified_ = function() {
    // Ready to inject template selection once calendar entry has loaded
    if(this.calendarEntryHasLoaded_()) {
        this.observerCalendarEdit_.disconnect();
        this.injectTemplateSelection();

        if(this.meetButtonExists_()) {
            this.observeMeetButtonClicked_(this.getMeetButton_());
        }

        // Continually observe video conferencing section as meet button can be toggled on and off
        this.observerMeetDetailsAdded_.observe(document.querySelector('#xRTCIn'), this.observerConfig_);
    }
}

// @TODO: https://trello.com/c/52TiS4Kq/20-integrate-with-calendar-api
// This is super hacky and should be replaced by official gCal integration
GCalendarEnhancer.prototype.observeMeetingDetailsOverlayModified_ = function(event) {
    // Only Google Meet is supported
    if(this.meetButtonExists_()) {
        this.observeMeetButtonClicked_(this.getMeetButton_());
    }
}

GCalendarEnhancer.prototype.getMeetingDetailsFromDOM_ = function(callback) {
    var calendarEventID = document.querySelector("#xDetDlg");
    calendarEventID = (calendarEventID === null)? this.currentMeetingID_ : calendarEventID.getAttribute("data-eventid");

    var meetID = document.querySelector("div[data-meet-url]");
    if(meetID !== null) {
        meetID = meetID.getAttribute("data-meet-url").split("/")[1];
    }
    else if (document.querySelector("#xDetDlgVideo")){
        meetID = document.querySelector("#xDetDlgVideo").getAttribute("data-details").split("/").pop();
    }

    var meetingTimingNode = document.querySelector("#xDetDlg .DN1TJ");
    var meetingTimingText = "";
    if(meetingTimingNode == null && document.querySelector("#xDaRaSel") != null) {
        // Edit view
        meetingTimingNodes = document.querySelector("#xDaRaSel").querySelectorAll("input");
        meetingTimingText = meetingTimingNodes[0].value + " ";
        meetingTimingText += meetingTimingNodes[1].value + " – ";
        meetingTimingText += meetingTimingNodes[2].value;
    }
    else if (document.querySelector("#xDetDlg .DN1TJ") != null){
        // Popup view
        meetingTimingText = document.querySelector("#xDetDlg .DN1TJ").innerText;
        meetingTimingText = meetingTimingText.replace("⋅", " " + new Date().getFullYear() + " ");
    } else {
        // Popup view for new meeting
        meetingTimingText = document.querySelector(".XAsDAf").innerText.replace(/\n| /g,' ');
        meetingTimingText = meetingTimingText.replace(/(\d\d:)/,new Date().getFullYear() + ' $1');
    }

    var meetingHost = "You";
    if(document.querySelector("#xCalOwn")) {
        // Edit view
        meetingHost = document.querySelector("#xCalOwn").innerText;
    }
    else if(document.querySelector("#xDetDlgCal")) {
        // Popup view
        meetingHost = document.querySelector("#xDetDlgCal").getAttribute("data-text").split(" – ")[0];
    }

    var meetingTiming = 
        this.getMeetingStartAndEndFromString_(meetingTimingText);
    var meetingStartTime = meetingTiming[0];
    var meetingEndTime = meetingTiming[1];
    var guestResponses = this.getGuestResponsesFromDOM_();
    var meetingSaveID = this.getMeetingStartDay_() + "-" + meetID;

    var meetingDetails = {};
    meetingDetails["meetID"] = meetID;
    meetingDetails["meetingSaveID"] = meetingSaveID;
    meetingDetails["calendarEventID"] = calendarEventID;
    meetingDetails["meetingHost"] = meetingHost;
    meetingDetails["meetingStartTime"] = meetingStartTime;
    meetingDetails["meetingEndTime"] = meetingEndTime;
    meetingDetails["guestResponses"] = guestResponses;

    var textArea = document.querySelector("#xDetDlgDesc");
    textArea = (textArea === null)? document.querySelector("#xDescIn") : textArea;
    this.getExistingTemplate_(textArea, function(value) {
        meetingDetails["meetingTemplate"] = value;
        callback(meetingDetails);
    }.bind(this));
}

GCalendarEnhancer.prototype.getMeetingStartDay_ = function() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    var diff = (now - start) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
    var oneDay = 1000 * 60 * 60 * 24;
    var day = Math.floor(diff / oneDay);
    return day;
}

GCalendarEnhancer.prototype.getGuestResponsesFromDOM_ = function() {
    var guestResponses =  {
        guestCount: 0,
        yesCount: 0,
        noCount: 0,
        maybeCount: 0,
        awaitingCount: 0,
        inviteeResponses: []
    }

    // Guest count and count of responses
    var guestResponsesNode = document.querySelector("#xDetDlgAtt .JAPzS");
    if(guestResponsesNode !== null) {
        guestResponses["guestCount"] = guestResponsesNode.innerText.split(" ")[0];
        responses = document.querySelector("#xDetDlgAtt .DN1TJ.fX8Pqc").innerText.split(",");
        responses.forEach(function(value, index) {
            value = value.trim();
            guestResponses[value.split(" ")[1] + "Count"] = parseInt(value.split(" ")[0]);
        });
    }

    // Individual response details
    var inviteeResponsesNode = document.querySelector("#xDtlDlgOrg");
    if (inviteeResponsesNode !== null) {
        var inviteeResponses = inviteeResponsesNode.parentElement.childNodes;
        inviteeResponses.forEach(function(value, index) {
            var invitee = {}

            invitee["isOrganizer"] = value.getAttribute("aria-label").indexOf("Organiser") !== -1;
            invitee["isGroup"] = value.getAttribute("data-is-expandable") === "true";
            invitee["isOptional"] = value.getAttribute("aria-label").indexOf("Optional") !== -1;
            invitee["userCount"] = (invitee["isGroup"])? 
                value.querySelector(".gLs5v").innerText.match(/\((.*?)\)/)[1] : 1;
            invitee["email"] = value.getAttribute("data-email");
            invitee["image"] = value.querySelector(".jPtXgd")
            if(invitee["image"] !== null) {
                invitee["image"] = invitee["image"] .getAttribute("style").match(/\((.*?)\)/)[1].replace(/('|")/g,'');
            }
            var responseParts = value.getAttribute("aria-label").split(",");
            if(!invitee["isGroup"]) {
                invitee["response"] = "";
                if(responseParts.length > 1) {
                    invitee["response"] = value.getAttribute("aria-label").split(",")[1].replace(" ", "").toLowerCase();
                }
            }
            invitee["name"] = responseParts[0];

            guestResponses["inviteeResponses"].push(invitee);
        });
    }

    return guestResponses;
}

GCalendarEnhancer.prototype.getMeetingStartAndEndFromString_ = function(meetingString) {
    var meetingYear = new Date().getFullYear();

    var meetingStartTime = meetingString.split("–")[0];
    meetingStartTime = Date.parse(meetingStartTime);

    var meetingEndTime = meetingString.split(meetingYear)[0];
    meetingEndTime += meetingYear;
    meetingEndTime += meetingString.split("–")[1];
    meetingEndTime = Date.parse(meetingEndTime);

    return [meetingStartTime, meetingEndTime];
}

GCalendarEnhancer.prototype.handleGMeetButtonClicked_ = function() {
    var backgroundRequest = {
        command: "getValueForKeyFromObjectStore",
        key: this.currentMeetingDetails_["meetingSaveID"],
        objectStoreName: this.meetingObjectStoreName_
    }

    var callback = function(value) {
        // Check to see if save data needs updating (details were not previously saved or meeting is in future)
        var needsUpdating = false;
        if(this.currentMeetingDetails_["meetingEndTime"] > Date.now() || (value && !value["calendarEventID"])) {
            needsUpdating = true;
        }

        // Merge details with whatever has already been captured
        var saveData = {};
        if(value != null) {
            saveData = {...value, ...this.currentMeetingDetails_ }
        } else {
            saveData = this.currentMeetingDetails_;
        }
        
        if(needsUpdating) {
             var backgroundRequest = {
                command: "updateValueInObjectStore",
                value: saveData,
                objectStoreName: this.meetingObjectStoreName_
            }

            chrome.runtime.sendMessage(backgroundRequest, function(){});
        }
    }.bind(this);

    chrome.runtime.sendMessage(backgroundRequest, callback);
}

GCalendarEnhancer.prototype.templateSelected_ = function(e) {
    var templateName = document.querySelector("#template-value div[aria-selected=true] span").innerHTML.toLowerCase().replace(":","");
    this.populateDescriptionWithTemplate_(templateName);
    this.selectedTemplate_ = templateName;

    var backgroundRequest = {
        command: "registerAnalyticsEvent",
        eventCategory: "Templates",
        eventAction: "selected",
        eventLabel: templateName
    }
    chrome.runtime.sendMessage(backgroundRequest, null);
}

GCalendarEnhancer.prototype.populateDescriptionWithTemplate_ = function(templateName) {
    var templateHTML = this.templates_["preamble"] + this.templates_[templateName];
    document.querySelector("#xDescIn div[contenteditable=true]").innerHTML = templateHTML;
    document.querySelector(".iSSROb.snByac").hidden = true;
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // When we edit a calendar event start observing DOM for textarea loading
    if( request.message === "calendar_edit" ) {
      var config = { attributes: false, childList: true, subtree: true };
      GCalendarEnhancer.getCalendarEditObserver().observe(document.body, GCalendarEnhancer.getObserverConfig());
    }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // When we edit a calendar event start observing DOM for textarea loading
    if( request.message === "calendar_edit_exit" ) {
      GCalendarEnhancer.setCurrentMeetingID(null);
    }
});