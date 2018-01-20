const nsIPrefBranch = Components.interfaces.nsIPrefBranch;
const prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch2);

function getPref(name) {
	var prefName = "extensions.firebug.flashbug." + name;
	var type = prefs.getPrefType(prefName);
	
	if (type == nsIPrefBranch.PREF_STRING) {
		return prefs.getCharPref(prefName);
	} else if (type == nsIPrefBranch.PREF_INT) {
		return prefs.getIntPref(prefName);
	} else if (type == nsIPrefBranch.PREF_BOOL) {
		return prefs.getBoolPref(prefName);
	}
};

function setPref(name, value) {
	var prefName = "extensions.firebug.flashbug." + name;
	var type = prefs.getPrefType(prefName);
	
	if (type == nsIPrefBranch.PREF_STRING) {
		prefs.setCharPref(prefName, value);
	} else if (type == nsIPrefBranch.PREF_INT) {
		prefs.setIntPref(prefName, value);
	} else if (type == nsIPrefBranch.PREF_BOOL) {
		prefs.setBoolPref(prefName, value);
	}
};

function onSettingsLoad() {
    document.getElementById("useGlobalVariables").checked = 	getPref("useGlobalVariables");
    document.getElementById("maxLines").value = 				getPref("maxLines");
    document.getElementById("maxWarnings").value = 				getPref("maxWarnings");
	document.getElementById("enableErrors").checked = 			getPref("enableErrors");
	document.getElementById("enablePolicy").checked = 			getPref("enablePolicy");
	document.getElementById("enablePolicyAppend").checked = 	getPref("enablePolicyAppend");
	
	document.getElementById("traceOutputBuffered").checked = 	getPref("traceOutputBuffered");
	document.getElementById("aS3Verbose").checked = 			getPref("aS3Verbose");
	document.getElementById("aS3Trace").checked = 				getPref("aS3Trace");
	document.getElementById("aS3StaticProfile").checked = 		getPref("aS3StaticProfile");
	document.getElementById("aS3DynamicProfile").checked = 		getPref("aS3DynamicProfile");

    /** charset **/
    var tmp_char = getPref("charSet");
    var element = document.getElementById("cbCharset");
    for(var a = 0; a < element.firstChild.childNodes.length; a++) {
        if(tmp_char == element.firstChild.childNodes[a].value) {
            element.selectedIndex = a;
            break;
        }
    }
}

function onSettingsAccept() {
	setPref("maxLines", 			document.getElementById("maxLines").value);
	setPref("maxWarnings", 			parseInt(document.getElementById("maxWarnings").value));
	setPref("useGlobalVariables", 	document.getElementById("useGlobalVariables").checked);
	setPref("enableErrors", 		document.getElementById("enableErrors").checked);
	setPref("enablePolicy", 		document.getElementById("enablePolicy").checked);
	setPref("enablePolicyAppend", 	document.getElementById("enablePolicyAppend").checked);
	
	setPref("traceOutputBuffered", 	document.getElementById("traceOutputBuffered").checked);
	setPref("aS3Verbose", 			document.getElementById("aS3Verbose").checked);
	setPref("aS3Trace", 			document.getElementById("aS3Trace").checked);
	setPref("aS3StaticProfile", 	document.getElementById("aS3StaticProfile").checked);
	setPref("aS3DynamicProfile", 	document.getElementById("aS3DynamicProfile").checked);
	
	setPref("charSet", 				document.getElementById("cbCharset").selectedItem.value);
	
	var valEnableErrors = getPref("enableErrors") ? 1 : 0;
	var valEnablePolicy = getPref("enablePolicy") ? 1 : 0;
	var valEnablePolicyAppend = getPref("enablePolicyAppend") ? 1 : 0;
	var valEnableOuputBuff = getPref("traceOutputBuffered") ? 1 : 0;
	var valEnableVerbose = getPref("aS3Verbose") ? 1 : 0;
	var valEnableTrace = getPref("aS3Trace") ? 1 : 0;
	var valEnableStatic = getPref("aS3StaticProfile") ? 1 : 0;
	var valEnableDynamic = getPref("aS3DynamicProfile") ? 1 : 0;
	
	try {
		Flashbug.saveMMFile(valEnableErrors, 
							getPref("maxWarnings"), 
							valEnablePolicy, 
							valEnablePolicyAppend,
							valEnableOuputBuff,
							valEnableVerbose,
							valEnableTrace,
							valEnableStatic,
							valEnableDynamic);
	} catch (e) {
		alert(e);
	}
}