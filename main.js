main();

function main() {
	if(window.location.hostname === "calendar.google.com") {
		window.GCalendarEnhancer = new GCalendarEnhancer();
	}

	if(window.location.hostname === "meet.google.com") {
		window.GMeetEnhancer = new GMeetEnhancer();
	}

	if(window.location.protocol === "chrome-extension:") {
		if(window.location.pathname.indexOf("meeting-logs") != -1) {
			window.BetterMeetingsMeetingLogs = new BetterMeetingsMeetingLogs();
		}
		else if(window.location.pathname.indexOf("index") != -1) {
			window.BetterMeetingsOverview = new BetterMeetingsOverview();
		}
	}
}