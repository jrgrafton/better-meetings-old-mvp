function GMeetEnhancer() {
    this.observerConfig_ = { attributes: false, childList: true, subtree: true };
    this.observer_ = null;

    this.captionsOn_ = false;
    this.meetingStates_ = {
        GREEN_ROOM: "GREEN_ROOM",
        IN_MEETING: "IN_MEETING"
    }
    this.meetingState_ = this.meetingStates_.GREEN_ROOM;
    this.speakerImages_ = {};

    this.windowJustResized_ = false;
    this.speakerBuffer_ = [];
    this.meetingTranscript_ = [];

    // Used for save data
    this.meetingSaveKey_ = null;
    this.meetingObjectStoreName_ = "g-meet-enhancer";
    this.meetingObjectStoreKeyPath_ = "meetingSaveID";
    this.meetingSaveData_ = {};

    this.init_();
}

/**********************/
/** Public functions **/
/**********************/

/***********************/
/** Private functions **/
/***********************/
GMeetEnhancer.prototype.init_ = function() {
    var meetingID = this.currentMeetingID_ = window.location.href.split("/").slice(-1).pop().split("?")[0];

    // We're likely on meetings.google.com; we have nothing to do
    if(meetingID == null) return;
    
    this.meetingSaveKey_ = this.getMeetingStartDay_() + "-" + meetingID;
    this.meetingSaveData_[this.meetingObjectStoreKeyPath_] = this.meetingSaveKey_;

    var backgroundRequest = {
        command: "createObjectStore",
        objectStoreName: this.meetingObjectStoreName_,
        saveKey: this.meetingSaveKey_,
        defaultValue: this.meetingSaveData_,
        keyPath: this.meetingObjectStoreKeyPath_
    }

    var callback = function(result) {
        if(result != null) {
            this.meetingSaveData_ = {...result, ...this.meetingSaveData_}
        } else {
            this.meetingSaveData_["meetingTranscript"] = [];
            this.meetingSaveData_["meetingParticipants"] = {};
        }
    }.bind(this);

    chrome.runtime.sendMessage(backgroundRequest, callback);

    // Wait for page to fully load then attach to meeting join
    window.addEventListener("load", () => {
        this.observeJoinMeeting_();
        this.setMeetingState_(this.meetingStates_.GREEN_ROOM);
    });
    
    // Weird bug where subtitle DOM modifications are trigged upon window resize
    window.addEventListener('resize', this.observeWindowResized_.bind(this));
}

// @TODO: make this calculated once (even through page refreshes)
GMeetEnhancer.prototype.getMeetingStartDay_ = function() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    var diff = (now - start) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
    var oneDay = 1000 * 60 * 60 * 24;
    var day = Math.floor(diff / oneDay);
    return day;
}

GMeetEnhancer.prototype.observeWindowResized_ = function() {
    this.windowJustResized_ = true;
    setTimeout(function() { this.windowJustResized_ = false; }.bind(this), 200);
}

GMeetEnhancer.prototype.observeJoinMeeting_ = function() {
    // Hacky but more resiliant than relying on class that current shows up in DOM
    var targets = document.querySelectorAll("div [role=button]");
    var joinMeetingTarget = null;

    for(var i = 0; i < targets.length; i++) {
        if(targets[i].innerText.indexOf("Join now") != -1) {
            joinMeetingTarget = targets[i];
        }
    }

    // TODO: fix joining meeting via https://meet.google.com/
    if(joinMeetingTarget == null) return;

    joinMeetingTarget.removeEventListener("mouseup", this.handleMeetingJoin_.bind(this));
    joinMeetingTarget.addEventListener("mouseup", this.handleMeetingJoin_.bind(this));
}

GMeetEnhancer.prototype.observeCaptionsLoaded_ = function(event) {
    // Auto turn on subtitles when joining meeting
    var subtitlesButton = document.querySelector(".Q8K3Le");
    if(subtitlesButton !== null) {
        subtitlesButton.firstElementChild.click();
        var subtitlesOn = true;
        subtitlesButton.firstElementChild.onclick = function() {
            subtitlesOn = !subtitlesOn;
            var backgroundRequest = {
                command: "registerAnalyticsEvent",
                eventCategory: "subtitles",
                eventAction: "toggled",
                eventLabel: "" + subtitlesOn
            }
            chrome.runtime.sendMessage(backgroundRequest, null);
        }
    }

    var subtitlesElement = document.querySelector(".a4cQT");
    if(subtitlesElement !== null) {
        this.observer_.disconnect();
        this.observer_ = new MutationObserver(this.observeCaptionsUpdated_.bind(this));
        this.observer_.observe(subtitlesElement, this.observerConfig_);
    }

    // Attach to meeting leave button
    var leaveButton = document.querySelector(".s1GInc");
    if(leaveButton !== null) {
        leaveButton.firstElementChild.addEventListener("mouseup", this.handleMeetingLeave_.bind(this));
    }
}

/**
 * Triggered when subtitle DOM mutuates.
 * 
 * Due to constant updating of subtitles during dictation due to NLP 
 * we took approach of:
 * 
 * 1. Detect speaker start via addition of img tag
 * 2. Detect speaker finish via removal of image tag
 * 3. Buffer input for speaker when <span> is removed
 *    a. This gaurantees that the text finalized
 *    b. As text is always removed from the top, it's concatenated
 *    with the oldest unfinished speaker.
 *
 * @param {MutationRecord} an array of MutationRecord objects, describing each change that occurred;
 */
GMeetEnhancer.prototype.observeCaptionsUpdated_ = function(events) {
    // Window resizing seems to mutate subtitle DOM
    if(this.windowJustResized_) return;

    var utterance = "";
    var utteranceEndSpeakerName = null;

    for(var i = 0; i < events.length; i++) {
        var event = events[i];
        for(var j = 0; j < event.removedNodes.length; j++) {
            var element = event.removedNodes[j];
            if(element.innerHTML && element.innerHTML.indexOf("<img") !== -1) {
                utteranceEndSpeakerName = element.querySelector(".zs7s8d").innerHTML;
            }
            if(element.innerHTML && element.innerHTML.indexOf("</span>") !== -1 && element.innerText != null) {
                utterance = element.innerText + utterance;
            }
        }
        for(var j = 0; j < event.addedNodes.length; j++) {
            var element = event.addedNodes[j];
            
            // New person started speaking
            if(element.innerHTML && element.innerHTML.indexOf("<img") !== -1) {
                if(this.speakerBuffer_.length > 0) {
                    this.speakerBuffer_[this.speakerBuffer_.length - 1].speakerEnd = new Date().getTime();
                }

                var regex = /<img.*?src="(.*?)"/;
                var speakerStart = new Date().getTime();
                var speakerImage = regex.exec(element.innerHTML)[1];
                var speakerName = element.querySelector(".zs7s8d").innerHTML;
                this.speakerImages_[speakerName] = speakerImage;

                this.speakerBuffer_.push({
                    speakerStart : speakerStart,
                    speakerName : speakerName,
                    speakerImage : speakerImage,
                    speakerUtterance : ""
                });
            }
        }
    }

    if(utterance && utterance.length > 0) {
        // Utterance overflow without speaker being removed (i.e. line has been removed but image has not)
        if(utteranceEndSpeakerName === null) {
            this.speakerBuffer_[0].speakerUtterance += utterance;
        } 
        // Utterance completed speaker completed (e.g. image has been removed)
        else {
            for(var i = 0; i < this.speakerBuffer_.length; i++) {
                if(this.speakerBuffer_[i].speakerName === utteranceEndSpeakerName) {
                    this.speakerBuffer_[i].speakerUtterance += utterance;
                    speaker = this.speakerBuffer_.splice(i, 1)[0];
                    this.meetingTranscript_.push(speaker);
                    this.saveSpeakerUtterance_(speaker);
                    break;
                }
            }
        }
    }
}

GMeetEnhancer.prototype.setMeetingState_ = function(state) {
    console.log("Meeting state: " + state);
    this.meetingState_ = state;
}

GMeetEnhancer.prototype.saveSpeakerUtterance_ = function(utterance) {
    // Save utterance
    if(this.meetingSaveData_["meetingTranscript"] == null) {
        this.meetingSaveData_["meetingTranscript"] = [];
    }

    this.meetingSaveData_.meetingTranscript.push(utterance);

    // Update participation data
    this.updateMeetingParticipation_(utterance);
    this.saveCurrentData_();
}

GMeetEnhancer.prototype.saveCurrentData_ = function() {
    // Save data
    var backgroundRequest = {
        command: "updateValueInObjectStore",
        objectStoreName: this.meetingObjectStoreName_,
        value: this.meetingSaveData_
    }

    chrome.runtime.sendMessage(backgroundRequest, function() {});
}

GMeetEnhancer.prototype.updateMeetingParticipation_ = function(utterance) {
    if(this.meetingSaveData_["meetingParticipants"] == null) {
        this.meetingSaveData_["meetingParticipants"] = {};
    }

    var meetingParticipant = this.meetingSaveData_["meetingParticipants"][utterance.speakerName];

    if(meetingParticipant == null) {
        meetingParticipant = {};
        meetingParticipant["image"] = utterance.speakerImage;
        meetingParticipant["name"] = utterance.speakerName;
        meetingParticipant["timeSpoken"] = 0;
    }
    if(utterance.speakerEnd == null) {
        utterance.speakerEnd = new Date().getTime();
    }

    meetingParticipant["timeSpoken"] += utterance.speakerEnd - utterance.speakerStart;
    this.meetingSaveData_["meetingParticipants"][utterance.speakerName] = meetingParticipant;
}

GMeetEnhancer.prototype.handleMeetingJoin_ = function(e) {
    this.setMeetingState_(this.meetingStates_.IN_MEETING);
    
    // Observe all DOM modifications until user is fully in meeting
    this.observer_ = new MutationObserver(this.observeCaptionsLoaded_.bind(this));
    this.observer_.observe(document.body, this.observerConfig_);

    // Capture meeting name
    this.meetingSaveData_["meetingName"] = document.querySelector(".Jyj1Td").innerText;

    // Capture meeting join time
    var meetingJoinTime = new Date().getTime();
    var previousMeetingJoinTime = this.meetingSaveData_["meetingJoinTime"];
    if(previousMeetingJoinTime == null || 
        (this.meetingSaveData_["meetingStartTime"] != null && 
            previousMeetingJoinTime < this.meetingSaveData_["meetingStartTime"])) {

        this.meetingSaveData_["meetingJoinTime"] = meetingJoinTime;
    }

    // Capture leaving meeting to save 
    window.onunload = this.handleMeetingLeave_.bind(this);

    this.saveCurrentData_();
}

GMeetEnhancer.prototype.handleMeetingLeave_ = function(e) {
    // Capture meeting leave time
    var meetingJoinTime = new Date().getTime();
    var previousMeetingLeaveTime = this.meetingSaveData_["meetingLeaveTime"];
    if(previousMeetingLeaveTime == null || 
        this.meetingSaveData_["meetingEndTime"] == null ||
        (this.meetingSaveData_["meetingEndTime"] != null && 
            previousMeetingLeaveTime < this.meetingSaveData_["meetingEndTime"])) {

        this.meetingSaveData_["meetingLeaveTime"] = meetingJoinTime;
    }

    this.saveCurrentData_();
}