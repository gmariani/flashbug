/* See license.txt for terms of usage */

define([
	"firebug/lib/xpcom"
],
function(Xpcom) {

// ********************************************************************************************* //
// Constants

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;
var PROMPTSVC = Xpcom.CCSV('@mozilla.org/embedcomp/prompt-service;1', 'nsIPromptService');
var ALERTSVC = Xpcom.CCSV('@mozilla.org/alerts-service;1', 'nsIAlertsService');

var PopUp = {
		
		alert: function(body, title) {
			if(!title) title = 'Error';
			
			// Toaster popup
			//ALERTSVC.showAlertNotification('chrome://flashbug/skin/icon32.png', title, body, false, '', null);
			
			// Non-blocking alert popup
			PROMPTSVC.alert(null, title, body);
			
			// Information bar popup
			/*var notificationBox = gBrowser.getNotificationBox();
			var n = notificationBox.getNotificationWithValue('flashbug-notebox');
			if (n) {
				n.label = body;
			} else {
				notificationBox.appendNotification(body, 'flashbug-notebox', 'chrome://flashbug/skin/icon32.png', notificationBox.PRIORITY_WARNING_MEDIUM);
			}*/
		}
};

// ********************************************************************************************* //

return PopUp;

// ********************************************************************************************* //
});