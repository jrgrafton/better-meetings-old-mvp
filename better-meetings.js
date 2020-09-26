function BetterMeetings() {
	this.meetingSaveData_ = {};
    this.earliestRecordedMeeting_ = null;
    this.processedMeetings_ = null;

    // Threshold under which you count as not participating in a meeting
    this.participationThreshold_ = 1000 * 60;

	// Used for save data
    this.meetingObjectStoreName_ = "g-meet-enhancer";
    this.meetingObjectStoreKeyPath_ = "meetingSaveID";

    // Used for tracking completion of postMessage
    this.postMessageCount_ = 0;

	this.init_();
}

/***********************/
/** Private functions **/
/***********************/
BetterMeetings.prototype.init_ = function() {
    // Attach message listener for interacting with sandbox page
    window.addEventListener('message', this.handleMessageRecieved_.bind(this));

    // Register page view
    var backgroundRequest = {
        command: "registerAnalyticsPageView",
        pageName: location.pathname.split("/").slice(-1)[0]
    }
    chrome.runtime.sendMessage(backgroundRequest, null);

    // Open DB and fetch all data
    backgroundRequest = {
        command: "createObjectStore",
        objectStoreName: this.meetingObjectStoreName_,
        keyPath: this.meetingObjectStoreKeyPath_
    }
    chrome.runtime.sendMessage(backgroundRequest, function() {
    	backgroundRequest = {
    	    command: "getAllFromObjectStore",
    	    objectStoreName: this.meetingObjectStoreName_
    	}

    	chrome.runtime.sendMessage(backgroundRequest, function(value) {
    		this.meetingSaveData_ = value;
            this.processMeetings_();
            this.initSandbox_(this.renderPageDetails_.bind(this));
    	}.bind(this));
    }.bind(this));
}

BetterMeetings.prototype.renderPageDetails_ = function() {
    this.renderWeekStarting_();
    this.renderWeekSelect_();
}

BetterMeetings.prototype.renderWeekStarting_ = function() {
    var dateData = {}
    var template = document.querySelector("#template-week-starting").innerHTML;

    var monthNames = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
    var d = this.getSelectedWeekStart_();

    dateData.currentYear = d.getFullYear();
    dateData.currentMonth = monthNames[d.getMonth()];
    dateData.currentDay = d.getDate();
    dateData.currentDayPostfix = this.getDayPostfix_(dateData.currentDay);

    this.sendRenderTemplateRequest_(template, dateData, "#template-output-week-starting");
}

BetterMeetings.prototype.renderWeekSelect_ = function() {
    var weekData = {}
    var urlParams = new URLSearchParams(window.location.search);
    var weeksAgo = parseInt(urlParams.get('weeks-ago'));
    weeksAgo = (Number.isInteger(weeksAgo) && weeksAgo >= 0)? weeksAgo : 0;
    var template = document.querySelector("#template-week-select").innerHTML;
    var selectedWeek = this.getSelectedWeekStart_();
    var currentDate = new Date();

    // If selected week is latest then disable next week
    if(weeksAgo === 0) {
        weekData.nextWeekDisabled = "disabled";
    }
    else {
        // URL for next week
        urlParams.set("weeks-ago", weeksAgo - 1);
        weekData.nextWeekURL = "?" + urlParams.toString();
    }

    // If earliest meeting is earlier then start of last week disable previous week
    if(this.getSelectedWeekStart_().getTime() < this.earliestRecordedMeeting_.meetingLeaveTime) {
        weekData.previousWeekDisabled = "disabled";
    }
    else {
        // Url for previous week
        urlParams.set("weeks-ago", weeksAgo + 1);
        weekData.previousWeekURL = "?" + urlParams.toString();
    }

    this.sendRenderTemplateRequest_(template, weekData, "#template-output-week-select");
}

BetterMeetings.prototype.pageDetailsHaveRendered_ = function() {
    // Display page
    if(isNaN(this.processedMeetings_.avgTimeInMeetingsPerDay)) {
        document.querySelector(".no-meetings-found").style.display = "inline";
        document.querySelector(".meetings-found").style.display = "none";
    }
    else {
        document.querySelector(".no-meetings-found").style.display = "none";
        document.querySelector(".meetings-found").style.display = "inline";
    }
    document.querySelector(".page-container").classList.add("loaded");

    // Enable tool tips
    $(function () { $('[data-toggle="tooltip"]').tooltip() });
}

BetterMeetings.prototype.getSelectedWeekStart_ = function() {
    const d = new Date();
    const urlParams = new URLSearchParams(window.location.search);
    weeksAgo = parseInt(urlParams.get('weeks-ago'));
    weeksAgo = (Number.isInteger(weeksAgo) && weeksAgo >= 0)? weeksAgo : 0;

    d.setDate(d.getDate() - ((d.getDay() - 1) + (7 * weeksAgo)));
    return d;
}

BetterMeetings.prototype.getSelectedWeekEnd_ = function() {
    var d = new Date();
    var urlParams = new URLSearchParams(window.location.search);
    var weeksAgo = parseInt(urlParams.get('weeks-ago'));
    weeksAgo = (Number.isInteger(weeksAgo) && weeksAgo >= 0)? weeksAgo : 0;

    d.setDate(d.getDate() - ((d.getDay() - 1) + (7 * weeksAgo)) + 7);
    return d;
}

BetterMeetings.prototype.processMeetings_ = function() {
    // Sort by latest first 
    this.meetingSaveData_.sort(function(a, b) {
        return b.meetingJoinTime - a.meetingJoinTime;
    });

    // Filter out any meetings that you never joined
    this.meetingSaveData_ = this.meetingSaveData_.filter(value => value.meetingJoinTime != null);

    // Filter out meetings without any recorded participation
    this.meetingSaveData_ = this.meetingSaveData_.filter(value => value.meetingParticipants != null);

    this.earliestRecordedMeeting_ = this.meetingSaveData_[this.meetingSaveData_.length - 1];

    // Filter out any meetings that are outside of selected week
    const startDate = this.getSelectedWeekStart_();
    startDate.setHours(0,0,0,0);
    this.meetingSaveData_ = this.meetingSaveData_.filter(value => value.meetingJoinTime > startDate.getTime());

    const endDate = this.getSelectedWeekEnd_();
    endDate.setHours(0,0,0,0);
    this.meetingSaveData_ = this.meetingSaveData_.filter(value => value.meetingJoinTime < endDate.getTime());
}

BetterMeetings.prototype.processMeetingsIntoDays_ = function(meetings) {
    var processedMeetings = [];
    meetings.forEach(function(value, index) {
        var wrappedMeeting = this.getDateDataFromTimeStamp_(value.meetingJoinTime);
        var lastMeeting = processedMeetings.slice(-1);

        if(processedMeetings.length === 0 || lastMeeting[0].dayName !== wrappedMeeting.dayName) {
            wrappedMeeting.meetings = [];
            wrappedMeeting.meetings.push(value);
            processedMeetings.push(wrappedMeeting);
        }
        else {
            lastMeeting[0].meetings.push(value);
        }
    }.bind(this));

    return processedMeetings;
}

BetterMeetings.prototype.processStatsForMeetingWeek = function(meetingWeek) {
    var totalMeetings = 0;
    var totalDays = this.processedMeetings_.length;
    var totalTimeInMeetings = 0;
    var totalTimeSaved = 0;
    var nonParticipationCount = 0;

    meetingWeek.forEach(function(meetingDay, index) {
        totalMeetings += meetingDay.meetings.length;
        meetingDay.meetings.forEach(function(meeting, index) {
            if(!isNaN(meeting.meetingLeaveTime)) {
                totalTimeInMeetings += meeting.meetingLeaveTime - meeting.meetingJoinTime;
            } 
            if(meeting.meetingParticipants) {
                meeting.youParticipated = false;
                Object.keys(meeting.meetingParticipants).forEach(function(key) {
                var participant = meeting.meetingParticipants[key];   
                    if(participant.name == "You" && participant.timeSpoken > this.participationThreshold_) {
                        meeting.youParticipated = true;
                    }
                }.bind(this));
                if(!meeting.youParticipated) nonParticipationCount++;
            }   
            if(meeting.meetingStartTime && !isNaN(meeting.meetingLeaveTime)) {
                var meetingJoinedLength = meeting.meetingLeaveTime - meeting.meetingJoinTime;
                var meetingScheduledLength = meeting.meetingEndTime - meeting.meetingStartTime;
                var lengthDelta = meetingScheduledLength - meetingJoinedLength;
                totalTimeSaved += lengthDelta;
            }
        }.bind(this));
    }.bind(this));
    
    meetingWeek.avgMeetingsPerDay = Math.round(totalMeetings / totalDays);
    meetingWeek.avgTimeInMeetingsPerDay = Math.round(totalTimeInMeetings / totalDays);
    meetingWeek.percentageNonParticipation = Math.round((100 / totalMeetings) * nonParticipationCount);
    meetingWeek.nonParticipationCount = nonParticipationCount;
    meetingWeek.totalTimeSaved = totalTimeSaved;
}


BetterMeetings.prototype.initSandbox_ = function(callback) {
    var sandbox = document.createElement("iframe");
    sandbox.setAttribute("id", "handlebars-sandbox");
    sandbox.src = "sandbox.html";
    sandbox.onload = callback;

    document.body.appendChild(sandbox);
}

BetterMeetings.prototype.sendRenderTemplateRequest_ = function(renderTemplate, renderData, targetElementSelector) {
    this.postMessageCount_ += 1;

    var iframe = document.querySelector('#handlebars-sandbox');
    var message = {
        command: 'render',
        renderTemplate: renderTemplate,
        renderData: renderData,
        targetElementSelector: targetElementSelector
    };
    iframe.contentWindow.postMessage(message, '*');
}

BetterMeetings.prototype.handleMessageRecieved_ = function(event) {
    var command = event.data.command;
    var targetElementSelector = event.data.targetElementSelector;
    var html = event.data.html;

    switch(command) {
        case 'render':
            // Replace targetElementSelector with rendered html
            var template = document.createElement('template');
            var lastNode = null;
            template.innerHTML = html.trim();
            template.content.childNodes.forEach(function(value, index) {
                if(lastNode === null) {
                    document.querySelector(targetElementSelector).replaceWith(value);
                }
                else {
                    lastNode.after(value);
                }
                lastNode = value;
            }.bind(this));
        break;
    }

    // Show body when all messages have been processed
    if(--this.postMessageCount_ === 0) {
        this.pageDetailsHaveRendered_();
    }
}

BetterMeetings.prototype.registerMeetingWeekAnalytics_ = function(meetingWeek) {
    var backgroundRequest = {
        command: "registerAnalyticsEvent",
        eventCategory: "meetings",
        eventAction: "passive",
        eventLabel: "avgMeetingsPerDay",
        eventValue: meetingWeek.avgMeetingsPerDay
    }
    chrome.runtime.sendMessage(backgroundRequest, null);

    backgroundRequest = {
        command: "registerAnalyticsEvent",
        eventCategory: "meetings",
        eventAction: "passive",
        eventLabel: "avgTimeInMeetingsPerDay",
        eventValue: meetingWeek.avgTimeInMeetingsPerDay
    }
    chrome.runtime.sendMessage(backgroundRequest, null);

    backgroundRequest = {
        command: "registerAnalyticsEvent",
        eventCategory: "meetings",
        eventAction: "passive",
        eventLabel: "percentageNonParticipation",
        eventValue: meetingWeek.percentageNonParticipation
    }
    chrome.runtime.sendMessage(backgroundRequest, null);
}

BetterMeetings.prototype.getDayPostfix_ = function(d) {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
        case 1:  return "st";
        case 2:  return "nd";
        case 3:  return "rd";
        default: return "th";
    }
}

BetterMeetings.prototype.getDateDataFromTimeStamp_ = function(timestamp) {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const monthNames = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

    const d = new Date(timestamp);

    var dateData = {}
    dateData.dayName = dayNames[d.getDay()];
    dateData.day = d.getDate();
    dateData.dayPostfix = this.getDayPostfix_(dateData.day);
    dateData.monthName = monthNames[d.getMonth()];

    return dateData;
}