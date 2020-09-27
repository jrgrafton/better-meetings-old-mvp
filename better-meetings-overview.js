function BetterMeetingsOverview() {
    BetterMeetings.call(this);
}
// Inherit from base class
// TODO: https://trello.com/c/bP5Fm0fs/50-refactor-all-code-to-use-classes
BetterMeetingsOverview.prototype = Object.create(BetterMeetings.prototype);
Object.defineProperty(BetterMeetingsOverview.prototype, 'constructor', { 
    value: BetterMeetingsOverview, 
    enumerable: false, // so that it does not appear in 'for in' loop
    writable: true });

/***********************/
/** Private functions **/
/***********************/

BetterMeetingsOverview.prototype.renderPageDetails_ = function() {
    BetterMeetings.prototype.renderPageDetails_.call(this);
    
    this.renderAvgTimeInMeetings_();
    this.renderAvgMeetingsPerDay_();
    this.renderSavedTime_();
    this.renderParticipationTime_();
    this.renderRecommendation_();
}

BetterMeetingsOverview.prototype.renderAvgTimeInMeetings_ = function() {
    var hours = Math.floor(this.processedMeetings_.avgTimeInMeetingsPerDay / 1000 / 60 / 60);
    var minutes = Math.round(this.processedMeetings_.avgTimeInMeetingsPerDay / 1000 / 60 % 60);

    var template = document.querySelector("#template-avg-time-in-meetings").innerHTML;
    this.sendRenderTemplateRequest_(template, { hours : hours, minutes : minutes }, "#template-output-avg-time-in-meetings");
}


BetterMeetingsOverview.prototype.renderAvgMeetingsPerDay_ = function() {
    var template = document.querySelector("#template-avg-meetings-per-day").innerHTML;
    this.sendRenderTemplateRequest_(template, { avgMeetingsPerDay : this.processedMeetings_.avgMeetingsPerDay }, "#template-output-avg-meetings-per-day");
}

BetterMeetingsOverview.prototype.renderSavedTime_ = function() {
    var hours = this.processedMeetings_.totalTimeSaved / 1000 / 60 / 60;
    hours = (hours < 0)? Math.ceil(hours) : Math.floor(hours);
    var minutes = Math.round(this.processedMeetings_.totalTimeSaved / 1000 / 60 % 60);

    var template = document.querySelector("#template-avg-time-saved").innerHTML;
    this.sendRenderTemplateRequest_(template, { hours : hours, minutes : minutes }, "#template-output-time-saved");
}

BetterMeetingsOverview.prototype.renderParticipationTime_ = function() {
    var participationThreshold = Math.round(this.participationThreshold_ / 1000);

    var data = {
        percentageNonParticipation: this.processedMeetings_.percentageNonParticipation,
        participationThreshold: participationThreshold
    }
    var template = document.querySelector("#template-meeting-participation").innerHTML;
    this.sendRenderTemplateRequest_(template, data, "#template-output-meeting-participation");
}

BetterMeetingsOverview.prototype.renderRecommendation_ = function() {
    // TODO: https://trello.com/c/Z66kIE9g/53-expand-recommendations-beyond-reviewing-meetings-youre-not-participating-in
    var urlParams = new URLSearchParams(window.location.search);
    urlParams.set("requested-filter", "participation");

    var participationThreshold = Math.round(this.participationThreshold_ / 1000);
    var recommendationDefault = "No tips yet, check back later in the week!"; 
    var recommendation = `Your participation was < ${participationThreshold} seconds in ${this.processedMeetings_.percentageNonParticipation}%
        of your meetings this week. You should <a class="text-warning" href="meeting-logs.html?${urlParams.toString()}" target="_blank">review</a> whether your attendance
        is still required`;

    if(isNaN(this.processedMeetings_.percentageNonParticipation)|| this.processedMeetings_.percentageNonParticipation == 0) {
        recommendation = recommendationDefault;
    }

    var template = document.querySelector("#template-recommendation").innerHTML;
    this.sendRenderTemplateRequest_(template, { recommendation : recommendation }, "#template-output-recommendation");
}


BetterMeetingsOverview.prototype.processMeetings_ = function() {
    BetterMeetings.prototype.processMeetings_.call(this);

    this.processedMeetings_ = this.processMeetingsIntoDays_(this.meetingSaveData_);
    this.processStatsForMeetingWeek(this.processedMeetings_);
}