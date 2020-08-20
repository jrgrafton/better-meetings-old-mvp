function BetterMeetingsMeetingLogs() {
    BetterMeetings.call(this);
}
// Inherit from base class
// TODO: https://trello.com/c/bP5Fm0fs/50-refactor-all-code-to-use-classes
BetterMeetingsMeetingLogs.prototype = Object.create(BetterMeetings.prototype);
Object.defineProperty(BetterMeetingsMeetingLogs.prototype, 'constructor', { 
    value: BetterMeetingsMeetingLogs, 
    enumerable: false, // so that it does not appear in 'for in' loop
    writable: true });

/***********************/
/** Private functions **/
/***********************/

BetterMeetingsMeetingLogs.prototype.renderPageDetails_ = function() {
    this.renderWeekStarting_();
    this.renderMeetings_();
    this.renderDayFilter_();

    this.registerMeetingWeekAnalytics_(this.processedMeetings_);
}

BetterMeetingsMeetingLogs.prototype.pageDetailsHaveRendered_ = function() {
    BetterMeetings.prototype.pageDetailsHaveRendered_.call(this);

    this.activateDayFilter_();
    this.activatePersonFilter_();

    var urlParams = new URLSearchParams(window.location.search);
    var requestedFilter = urlParams.get("requestedFilter");
    if(requestedFilter != null) {
        this.activateRequestedFilter_(requestedFilter);
    }
}

BetterMeetingsMeetingLogs.prototype.renderWeekStarting_ = function() {
    var dateData = {}
    var template = document.querySelector("#template-week-starting").innerHTML;

    const monthNames = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
    const d = new Date();
    d.setDate(d.getDate() - (d.getDay() - 1)); // Get date for previous Monday

    dateData.currentYear = d.getFullYear();
    dateData.currentMonth = monthNames[d.getMonth()];
    dateData.currentDay = d.getDate();
    dateData.currentDayPostfix = this.getDayPostfix_(dateData.currentDay);

    this.sendRenderTemplateRequest_(template, dateData, "#template-output-week-starting");
}

BetterMeetingsMeetingLogs.prototype.processMeetings_ = function() {
    BetterMeetings.prototype.processMeetings_.call(this);

    this.meetingSaveData_.forEach(function(meeting, index) {
        // Process join and leave time
        this.processJoinAndLeaveTime_(meeting);

        // Process time spent or saved
        this.processTimeSavedSpent_(meeting);

        // Process participant data
        if(meeting.meetingParticipants) {
            this.processMeetingParticipants_(meeting);
        }

        // Process guest data
        if(meeting.guestResponses) {
            this.processGuestResponses_(meeting);
        }

        // Process transcript
        if(meeting.meetingTranscript) {
            this.processMeetingTranscript_(meeting);
        }
    }.bind(this));

    this.processedMeetings_ = this.processMeetingsIntoDays_(this.meetingSaveData_);
    this.processStatsForMeetingWeek(this.processedMeetings_);
}

BetterMeetingsMeetingLogs.prototype.renderMeetings_ = function() {
    // Sort by meeting start time
    if(this.meetingSaveData_.length == 0) {
        // @TODO: render empty page
        return;
    }

    var template = document.querySelector("#template-meetings").innerHTML;

    // Render meetings
    this.sendRenderTemplateRequest_(template, { meetingDays : this.processedMeetings_ }, "#template-output-meetings");
}

BetterMeetingsMeetingLogs.prototype.processJoinAndLeaveTime_ = function(meeting) {
    var dJoin = new Date(meeting.meetingJoinTime);
    var dLeave = new Date(meeting.meetingLeaveTime);
    meeting.meetingJoinTimeString = ("0" + dJoin.getHours()).slice(-2) + ":" + ("0" + dJoin.getMinutes()).slice(-2);
    meeting.meetingLeaveTimeString = ("0" + dLeave.getHours()).slice(-2) + ":" + ("0" + dLeave.getMinutes()).slice(-2);
}

BetterMeetingsMeetingLogs.prototype.processTimeSavedSpent_ = function(meeting) {
    meeting.meetingTimeSavedString = "";
    var meetingJoinedLength = meeting.meetingLeaveTime - meeting.meetingJoinTime;
    if(meeting.meetingStartTime) {
        var meetingScheduledLength = meeting.meetingEndTime - meeting.meetingStartTime;

        var lengthDelta = meetingScheduledLength - meetingJoinedLength;
        if(lengthDelta < 0) {
            meeting.meetingTimeSavedString = "over time";
            meeting.meetingLeaveTimeString = "<span class='text-danger'>" + meeting.meetingLeaveTimeString + "</span>";
        } else {
            meeting.meetingTimeSavedString = "under time";
            meeting.meetingLeaveTimeString = "<span class='text-success'>" + meeting.meetingLeaveTimeString + "</span>";
        }
        var mins = Math.floor(Math.abs(lengthDelta) / 1000 / 60);
        var seconds = Math.round(Math.abs(lengthDelta) / 1000 % 60);

        meeting.meetingTimeSavedString = `(${mins}m ${seconds}s ${meeting.meetingTimeSavedString})`;
    }
}

BetterMeetingsMeetingLogs.prototype.processMeetingParticipants_ = function(meeting) {
    var meetingParticipantsSorted = [];
    var meetingJoinedLength = meeting.meetingLeaveTime - meeting.meetingJoinTime;

    Object.keys(meeting.meetingParticipants).forEach(function(key) {
        var meetingParticipant = meeting.meetingParticipants[key];                
        meetingParticipant.participationPercentage = 
            Math.round((100 / meetingJoinedLength) * meetingParticipant.timeSpoken);
        meetingParticipant.timeSpokenMins = 
            ("0" + Math.floor(meetingParticipant.timeSpoken / 1000 / 60)).slice(-2);
        meetingParticipant.timeSpokenSecs = 
            ("0" + Math.round(meetingParticipant.timeSpoken / 1000 % 60)).slice(-2);

        // Hack so we don't need to request Chrome identity 
        if((meeting.meetingHost == "You" && meetingParticipant.name == "You") 
            || meeting.meetingHost == meetingParticipant.name) {
            meetingParticipant.isOrganizer = true;
        }
        meetingParticipantsSorted.push(meetingParticipant);
    });
    meetingParticipantsSorted.sort(function(a, b) {
        return b.timeSpoken - a.timeSpoken;
    });
    meeting.meetingParticipants = meetingParticipantsSorted;
}

BetterMeetingsMeetingLogs.prototype.processGuestResponses_ = function(meeting) {
    meeting.guestResponses.inviteeResponses.forEach(function(value, index) {
        if(value.isOrganizer) {
            meeting.meetingHost = value.name;
        }
    }.bind(this));
}

BetterMeetingsMeetingLogs.prototype.processMeetingTranscript_ = function(meeting) {
    var timestampOffset = meeting.meetingJoinTime;

    meeting.meetingTranscript.forEach(function(value, index) {
        var offsetMinutes = Math.floor((value.speakerStart - timestampOffset) / 1000 / 60);
        var offsetSeconds = Math.round(((value.speakerStart - timestampOffset) / 1000) % 60);

        offsetMinutes = ("0" + offsetMinutes).slice(-2);
        offsetSeconds = ("0" + offsetSeconds).slice(-2);

        value.speakerStartString = `${offsetMinutes}:${offsetSeconds}`;
        
    }.bind(this));
}

BetterMeetingsMeetingLogs.prototype.renderDayFilter_ = function() {
    var template = document.querySelector("#template-filter-days").innerHTML;
    var allDays = ["All"];

    // So that we start filter from earliest day in week
    var reversedMeetings = this.processedMeetings_.reverse();
    reversedMeetings.forEach(function(value, index) {
        allDays.push(value.dayName);
    }.bind(this));

    this.sendRenderTemplateRequest_(template, { filterDays : allDays }, "#template-output-filter-days");
}

BetterMeetingsMeetingLogs.prototype.activateDayFilter_ = function() {
    var filterClicked = function(event) {
        document.querySelectorAll("#template-output-filter-days a").forEach(function(value, index) {
            value.classList.remove("active");
        });
        event.target.classList.add("active");
        var day = event.target.innerText;

        // Sent GA event
        var backgroundRequest = {
            command: "registerAnalyticsEvent",
            eventCategory: "Filters",
            eventAction: "day",
            eventLabel: day.toLowerCase()
        }
        chrome.runtime.sendMessage(backgroundRequest, null);


        if(day == "All") {
            document.querySelectorAll(".meeting-day-group").forEach(function(value, index) {
                value.style.display = "inline";
            });
        } else {
            document.querySelector(`.meeting-day-group[data-meeting-day=${day}]`).style.display = "inline";
            var allOtherDayGroups = document.querySelectorAll(`.meeting-day-group:not([data-meeting-day=${day}])`);
            if(allOtherDayGroups != null) {
                allOtherDayGroups.forEach(function(value, index) {
                    value.style.display = "none";
                });
            }
        }
    }.bind(this);

    document.querySelectorAll("#template-output-filter-days a").forEach(function(value, index){
        value.onclick = filterClicked;
    });
}

BetterMeetingsMeetingLogs.prototype.activatePersonFilter_ = function() {
    var inputOnKeyUp = function(event) {
        var filterValue = event.target.value.toLowerCase();
        
        document.querySelectorAll(".meeting").forEach(function(value, index) {
            var meetingOrganizer = value.getAttribute("data-meeting-organizer");
            if(filterValue.length === 0 || 
                (meetingOrganizer.length > 0 && meetingOrganizer.toLowerCase().indexOf(filterValue) !== -1)) {
                value.style.display = "block";
            }
            else {
                value.style.display = "none";
            } 
        }.bind(this));
    }.bind(this);
    document.querySelector("#organizerFilterInput").onkeyup = inputOnKeyUp;

    // GA event for interaction with filter
    var backgroundRequest = {
        command: "registerAnalyticsEvent",
        eventCategory: "Filters",
        eventAction: "organizer",
        eventLabel: "activated"
    }
    document.querySelector("#dropdownMenuButtonOrganizer").onclick = function() {
        var wasActivated = document.querySelector("#organizerFilterInput").offsetParent == null;
        backgroundRequest.eventLabel = (wasActivated)? "activated" : "deactivated";
        chrome.runtime.sendMessage(backgroundRequest, null);
    };
}


BetterMeetingsMeetingLogs.prototype.activateRequestedFilter_ = function(filter) {
    // @TODO: https://trello.com/c/Z66kIE9g/53-expand-recommendations-beyond-reviewing-meetings-youre-not-participating-in
    if(filter === "participation") {
        document.querySelectorAll(".meeting[data-meeting-you-participated=true]").forEach(function(value, index) {
            value.style.display = "none";
        }.bind(this));
    }
}