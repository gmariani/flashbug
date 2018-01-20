const nsIPrefBranch = Components.interfaces.nsIPrefBranch;
const prefs = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefBranch2);

function $(id) {
	return document.getElementById(id);
};

function getPref(name) {
	var prefName = 'extensions.firebug.flashbug.' + name;
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
	var prefName = 'extensions.firebug.flashbug.' + name;
	var type = prefs.getPrefType(prefName);
	
	if (type == nsIPrefBranch.PREF_STRING) {
		prefs.setCharPref(prefName, value);
	} else if (type == nsIPrefBranch.PREF_INT) {
		prefs.setIntPref(prefName, value);
	} else if (type == nsIPrefBranch.PREF_BOOL) {
		prefs.setBoolPref(prefName, value);
	}
};
//

function internationalizeUI(doc) {
	var elements = ['winMain', 'tabGeneral', 'tabTrace', 'tabPolicy', 'tabNet', 'descGeneral', 'lblCharset', 'lblMaxLines', 'maxLines', 'capMMDesc', 
	'capTraceDesc', 'capPolDesc', 'enableErrors', 'lblMaxWarning', 'capTraceAdv', 'descUndoc', 'traceOutputBuffered', 'aS3Verbose', 'aS3Trace', 
	'aS3StaticProfile', 'aS3DynamicProfile', 'descPolicy', 'lblPolicyLink', 'enablePolicy', 'enablePolicyAppend', 'descNet', 'enableAMF', 'enableSWF',
	'capNetAMF', 'capNetSWF', 'capNetSWFFilter', 'enableSWFHeaderOnly', 'enableSWFFont', 'enableSWFBinary', 'enableSWFVideo', 
	'enableSWFShape', 'enableSWFMorph', 'enableSWFImage', 'enableSWFSound', 'enableSWFText', 'useGlobalVariables'];
	var attributes = ['label', 'tooltiptext', 'value', 'title'];
	
	Flashbug.internationalizeElements(doc, elements, attributes);
};

// Is called before checked status is updated from mouse event
function onSWF(e) {
	var disabled = $('enableSWF').checked;
	$('enableSWFHeaderOnly').disabled = disabled;
	if (!disabled && $('enableSWFHeaderOnly').checked) disabled = true;
	
	$('enableSWFFont').disabled = disabled;
	$('enableSWFBinary').disabled = disabled;
	$('enableSWFVideo').disabled = disabled;
	$('enableSWFShape').disabled = disabled;
	$('enableSWFMorph').disabled = disabled;
	$('enableSWFImage').disabled = disabled;
	$('enableSWFSound').disabled = disabled;
	
	if (!disabled && !$('enableSWFHeaderOnly').checked && !$('enableSWFFont').checked) disabled = true;
	$('enableSWFText').disabled = disabled;
};

function onHeaderOnly(e) {
	var disabled = !$('enableSWFHeaderOnly').checked;
	$('enableSWFFont').disabled = disabled;
	$('enableSWFBinary').disabled = disabled;
	$('enableSWFVideo').disabled = disabled;
	$('enableSWFShape').disabled = disabled;
	$('enableSWFMorph').disabled = disabled;
	$('enableSWFImage').disabled = disabled;
	$('enableSWFSound').disabled = disabled;
	
	if (!disabled && !$('enableSWFFont').checked) disabled = true;
	$('enableSWFText').disabled = disabled;
};

function onFont(e) {
	var disabled = $('enableSWFFont').checked;
	$('enableSWFText').disabled = disabled;
};

function onSettingsLoad() {
	$('useGlobalVariables').checked = 	getPref('useGlobalVariables');
	$('maxLines').value = 				getPref('maxLines');
	$('maxWarnings').value = 			getPref('maxWarnings');
	$('enableErrors').checked = 		getPref('enableErrors');
	$('enablePolicy').checked = 		getPref('enablePolicy');
	$('enablePolicyAppend').checked = 	getPref('enablePolicyAppend');

	$('traceOutputBuffered').checked = 	getPref('traceOutputBuffered');
	$('aS3Verbose').checked = 			getPref('aS3Verbose');
	$('aS3Trace').checked = 			getPref('aS3Trace');
	$('aS3StaticProfile').checked = 	getPref('aS3StaticProfile');
	$('aS3DynamicProfile').checked = 	getPref('aS3DynamicProfile');

	$('enableAMF').checked = 			getPref('enableAMF');
	$('enableSWF').checked = 			getPref('enableSWF');
	$('enableSWFHeaderOnly').checked = 	getPref('enableSWFHeaderOnly');
	$('enableSWFFont').checked = 		getPref('enableSWFFont');
	$('enableSWFBinary').checked = 		getPref('enableSWFBinary');
	$('enableSWFVideo').checked = 		getPref('enableSWFVideo');
	$('enableSWFShape').checked = 		getPref('enableSWFShape');
	$('enableSWFMorph').checked = 		getPref('enableSWFMorph');
	$('enableSWFImage').checked = 		getPref('enableSWFImage');
	$('enableSWFSound').checked = 		getPref('enableSWFSound');
	$('enableSWFText').checked = 		getPref('enableSWFText');
	
	// Init checkboxes
	var disabled = !$('enableSWF').checked;
	$('enableSWFHeaderOnly').disabled = disabled;
	if (!disabled && $('enableSWFHeaderOnly').checked) disabled = true;
	
	$('enableSWFFont').disabled = disabled;
	$('enableSWFBinary').disabled = disabled;
	$('enableSWFVideo').disabled = disabled;
	$('enableSWFShape').disabled = disabled;
	$('enableSWFMorph').disabled = disabled;
	$('enableSWFImage').disabled = disabled;
	$('enableSWFSound').disabled = disabled;
	
	if (!disabled && !$('enableSWFHeaderOnly').checked && !$('enableSWFFont').checked) disabled = true;
	$('enableSWFText').disabled = disabled;

    /** charset **/
    var tmp_char = getPref('charSet');
    var element = $('cbCharset');
    for(var a = 0; a < element.firstChild.childNodes.length; a++) {
        if(tmp_char == element.firstChild.childNodes[a].value) {
            element.selectedIndex = a;
            break;
        }
    }
	
	// Init mm.cfg
	$('mmLocation').value = Flashbug.getMMFile().path;
	
	$('traceLocation').value = Flashbug.getLogFile().path;
	
	$('policyLocation').value = Flashbug.getPolicyFile().path;
	
	internationalizeUI(document);
}

function onSettingsAccept() {
	setPref('useGlobalVariables', 	$('useGlobalVariables').checked);
	setPref('maxLines', 			$('maxLines').value);
	setPref('maxWarnings', 			parseInt($('maxWarnings').value));
	setPref('enableErrors', 		$('enableErrors').checked);
	setPref('enablePolicy', 		$('enablePolicy').checked);
	setPref('enablePolicyAppend', 	$('enablePolicyAppend').checked);
	
	setPref('traceOutputBuffered', 	$('traceOutputBuffered').checked);
	setPref('aS3Verbose', 			$('aS3Verbose').checked);
	setPref('aS3Trace', 			$('aS3Trace').checked);
	setPref('aS3StaticProfile', 	$('aS3StaticProfile').checked);
	setPref('aS3DynamicProfile', 	$('aS3DynamicProfile').checked);
	
	setPref('charSet', 				$('cbCharset').selectedItem.value);
	
	setPref('enableAMF', 			$('enableAMF').checked);
	setPref('enableSWF', 			$('enableSWF').checked);
	setPref('enableSWFHeaderOnly', 	$('enableSWFHeaderOnly').checked);
	setPref('enableSWFFont', 		$('enableSWFFont').checked);
	setPref('enableSWFBinary', 		$('enableSWFBinary').checked);
	setPref('enableSWFVideo', 		$('enableSWFVideo').checked);
	setPref('enableSWFShape', 		$('enableSWFShape').checked);
	setPref('enableSWFMorph', 		$('enableSWFMorph').checked);
	setPref('enableSWFImage', 		$('enableSWFImage').checked);
	setPref('enableSWFSound', 		$('enableSWFSound').checked);
	setPref('enableSWFText', 		$('enableSWFText').checked);
	
	var valEnableErrors = getPref('enableErrors') ? 1 : 0;
	var valEnablePolicy = getPref('enablePolicy') ? 1 : 0;
	var valEnablePolicyAppend = getPref('enablePolicyAppend') ? 1 : 0;
	var valEnableOuputBuff = getPref('traceOutputBuffered') ? 1 : 0;
	var valEnableVerbose = getPref('aS3Verbose') ? 1 : 0;
	var valEnableTrace = getPref('aS3Trace') ? 1 : 0;
	var valEnableStatic = getPref('aS3StaticProfile') ? 1 : 0;
	var valEnableDynamic = getPref('aS3DynamicProfile') ? 1 : 0;
	
	try {
		Flashbug.saveMMFile(valEnableErrors, 
							getPref('maxWarnings'), 
							valEnablePolicy, 
							valEnablePolicyAppend,
							valEnableOuputBuff,
							valEnableVerbose,
							valEnableTrace,
							valEnableStatic,
							valEnableDynamic);
	} catch (e) {
		Flashbug.alert(e);
	}
}