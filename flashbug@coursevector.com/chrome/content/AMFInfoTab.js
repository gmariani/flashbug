FBL.ns(function() { with (FBL) {
	
const AMF_MIME = "application/x-amf";

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

var $FL_STR = Flashbug.$FL_STR,
$FL_STRF = Flashbug.$FL_STRF;

function trace(msg, obj) {
	msg = "Flashbug - AMFTab::" + msg;
	if (FBTrace.DBG_FLASH_AMF) {
		if (typeof FBTrace.sysout == "undefined") {
			Flashbug.alert(msg + " | " + obj);
		} else {
			FBTrace.sysout(msg, obj);
		}
	}
}

var bbUserID;
var bbLeaders = {};
var bbOppTown = {};
	
Flashbug.AMFInfoModule = extend(Firebug.Module, {
	
	tabId1: "AMFPost",
	tabId2: "AMFResponse",
	trace: trace,
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends Module
	
	dispatchName: "AMFViewer",
	
    initialize: function() {
		trace("initialize");
		
		Firebug.Module.initialize.apply(this, arguments);
		
		// Add AMF as a cached content type
		var cachedTypes = Firebug.getPref(Firebug.prefDomain, "cache.mimeTypes");
		if(cachedTypes && cachedTypes.indexOf(AMF_MIME) == -1) {
			if(cachedTypes.length > 0) cachedTypes += " ";
			cachedTypes += AMF_MIME;
			Firebug.getPref(Firebug.prefDomain, "cache.mimeTypes", cachedTypes);
		}
		
		// Register NetInfoBody listener
        Firebug.NetMonitor.NetInfoBody.addListener(this);
        Firebug.NetMonitor.addListener(this);
		
		// Register cache listener
		Firebug.TabCacheModel.addListener(this);
    },
	
	// Call on every AMF loaded
	onResponseBody: function(context, file) {
		function decode(str) {
			return decodeURIComponent(str.replace(/\+/g,  " "));
		}
		
		function cleanPost(str) {
			var reHeaders = /^([^:]+):\s?(.*)[\r|\n]|\r?\n$|[\r\n]$/;
			var reCRLF = /^[\r\n]/;
			str = str.replace(reHeaders, ''); // Remove Referer header and one LF
			str = str.replace(reHeaders, ''); // Remove Content-type header and one LF
			str = str.replace(reHeaders, ''); // Remove Content-length header and one LF
			str = str.replace(reCRLF, ''); // Remove CRLF
			str = str.replace(reCRLF, ''); // Remove CRLF
			str = str.replace(reCRLF, ''); // Remove CRLF
			str = str.replace(/^[\r\n]/gm, ''); // Remove CRLF
			return str;
		}
		
		var console = Firebug.Console.getExposedConsole(context.window);
		var postText = file.postText;
		var responseText = file.responseText;
		
		// PvZ Logging
		if (file.href.indexOf('/pvzadventures/log.php') != -1) {
			console.group('PvZ Logging');
			
			postText = decode(cleanPost(postText));
			//console.log(postText);
			
			var json = postText.split('|||')[1];
			var objJSON = JSON.parse(json);
			
			if (objJSON.user_id) {
				bbUserID = objJSON.user_id;
				//console.log('User ID: ' + bbUserID);
			}
			
			console.dir(objJSON);
			
			if (responseText) console.log(decode(responseText));
			console.groupEnd();
		}
		
		/*if (file.href.indexOf('apps.facebook.com') >-1) {
			console.group('Facebook App Data');
			console.log(file.postText);
			console.log(file.responseText);
			console.groupEnd();
		}*/
		
		// Facebook OpenGraph Data
		/*if (file.href.indexOf('graph.facebook.com') >-1) {
			console.group('Facebook OpenGraph Data');
			//console.log(postText);
			//console.log(responseText);
			var strOGData;
			if (responseText.indexOf('<?xml version="1.0"?>') > -1) {
				// XML
				//console.log(responseText);
				var parser = CCIN('@mozilla.org/xmlextras/domparser;1', 'nsIDOMParser');
				var xml = parser.parseFromString(responseText, 'text/xml');
				strOGData = responseText.indexOf('<!DOCTYPE') == -1 ? xml.firstChild : xml.childNodes[1];
				console.dirxml(strOGData);
			} else {
				try {
					strOGData = JSON.parse(responseText);
					console.dir(strOGData);
				} catch (e) {
					//console.error("Parsing error:", e);
					strOGData = responseText.substr(0, 255) + '...';
					console.log(strOGData);
				}
			}
			
			console.groupEnd();
		}*/
		
		// Leaderboard Opponent IDs
		if (responseText && postText.indexOf('BrainBallService.getLeaderboard') != -1) {
			//console.log('Leaderboard');
			if (!file.responseAMF) {
					var worker = new Worker('chrome://flashbug/content/lib/AMFWorker.js');
					var t = this;
					worker.onmessage = function(event) {
						if (event.data.type == 'debug') {
							var arr = event.data.message,
								title = arr.shift();
							t.trace('Worker trace - ' + title, arr);
						} else {
							t.trace('Worker response complete', event.data);
						
							file.responseAMF = event.data;
							
							bbLeaders = {};
							var arrData = file.responseAMF.bodies[0].data;
							for (var i = 0; i < arrData.length; i++) {
								var o = arrData[i];
								bbLeaders[String(o.id)] = o;
							}
							
							//console.log(bbLeaders);
						}
					};
					worker.onerror = function(error) {
						t.trace('Worker error response: ' + error.message, error);
						console.log('Worker error response: ' + error.message);
					};
					
					//console.log(responseText);
					worker.postMessage(responseText);
			} else {
				//console.log(bbLeaders);
			}
		}
		
		// Opponent Town Info
		//console.log('FriendTownView: ' + postText.indexOf('FriendTownView'));
		if (responseText && postText.indexOf('FriendTownView') != -1) {
			//console.group('Opponent ' + bbOppID + ' Town Data');
			
			postText = cleanPost(postText);
			var reOppID = /(\d+).+FriendTownView$/g;
			var bbOppID = reOppID.exec(postText)[1];
			bbOppTown[bbOppID] = [];
			
			// Get town data
			var reNonXML = /^[^<]*|[^>]*$/gm;
			var reGameState = /<\/GameState>[^<]*<GameState>|<\/GameState>[^<]*<\?xml version=\"1.0\"\?>[^<]*<GameState>/gm;
			responseText = responseText.replace(reGameState, '</GameState>****<GameState>');
			responseText = responseText.replace(reNonXML, '');
			responseText = responseText.replace(/>[\r\n\s]*</gm, '><');
			responseText = responseText.split('****');
			bbOppTown[bbOppID] = {};
			
			var parser = CCIN('@mozilla.org/xmlextras/domparser;1', 'nsIDOMParser');
			for (var i = 0; i < responseText.length; i++) {
				try {
					var xml = parser.parseFromString(responseText[i], 'text/xml');
					//console.log(xml.firstChild.firstChild.attributes.getNamedItem("id").value);
					bbOppTown[bbOppID][xml.firstChild.firstChild.attributes.getNamedItem("id").value] = xml;
				} catch(e) {
					console.log(responseText[i]);
					console.log(e);
					bbOppTown[bbOppID][i] = e;
				}
			}
			
			//console.dir(bbOppTown[bbOppID]);
			//console.groupEnd();
		}
		
		// Upon Viewing Opponent Town
		//console.log('BrainBallResponse? : ' + responseText.indexOf('BrainBallResponse'));
		if (responseText.indexOf('BrainBallResponse') != -1) {
			try {
			postText = cleanPost(postText);
			var reOppID = /(\d+)$/;
			var bbOppID = reOppID.exec(postText);
			if (!bbOppID) {
				// Is current user not opponent data
				return;
			} else {
				bbOppID = bbOppID[1];
			}
			console.log('bbOppID: ' + bbOppID);
			console.log('bbUserID: ' + bbUserID);
			} catch(e) {
			console.log(postText);
			console.error(e);
			}
			
			if (bbOppID != bbUserID) {
				try {
				var brainBallResponse = responseText.slice(); // clone
				var xmlCatalog = bbOppTown[bbOppID]['GameBillableCatalog'].firstChild;
				var xmlStart = brainBallResponse.indexOf('<?xml version="1.0"?>');
				var xmlEnd = brainBallResponse.indexOf('</brainCount>') + 13;//String('</brainCount>').length;
				var xml = brainBallResponse.slice(xmlStart, xmlEnd);
				xml = xml.replace(/[\r\n]*/g, ''); // Remove CRLF
				xml = xml.replace(/>[^<\d]*/g, '>'); // Remove spaces
				xml = xml.replace(/[^><\d]*</g, '<'); // Remove spaces
				
				// Basic Data
				console.group('Opponent ' + bbOppID + ' Town');
				console.log('Brains Total: ' + bbLeaders[bbOppID].brains_total);
				console.log('Reward: ' + bbLeaders[bbOppID].reward);
				console.log('Player Level: ' + bbLeaders[bbOppID].level);
				} catch (e) {
					console.error(e);
				}
				
				// Currency
				try {
					var xmlCurrency = xmlCatalog.querySelector('[id=CurrencyManager]').firstChild;
					console.log('Player Zombucks: ' + Number(xmlCurrency.getElementsByTagName('zombucks')[0].getElementsByTagName('value')[0].innerHTML));
					console.log('Player Coins: ' + Number(xmlCurrency.getElementsByTagName('coins')[0].getElementsByTagName('value')[0].innerHTML));
					console.log('Player Gems: ' + Number(xmlCurrency.getElementsByTagName('gems')[0].getElementsByTagName('value')[0].innerHTML));
				} catch (e) {
					console.error(e);
				}
				
				if (bbLeaders[bbOppID].immune_until != "0") {
					var date = new Date(parseInt(bbLeaders[bbOppID].immune_until) * 1000);
					console.log('Immune Until: ' + date.toLocaleString());
				}
				
				// Zombies Types Available
				console.group('Zombie Types Available');
				try {
					var xmlZombies = xmlCatalog.querySelector('[id=ZombieStorageManager]').firstChild;
					var oData = {};
					for (var i = 0; i < xmlZombies.childNodes.length; i++) {
						oData[xmlZombies.childNodes[i].nodeName] = Number(xmlZombies.childNodes[i].innerHTML);
					}
					console.dir(oData);
				} catch (e) {
					console.error(e);
				}
				console.groupEnd();
				
				// Plant Types Available
				console.group('Premium Plant Types Available');
				try {
					var xmlPlants = xmlCatalog.querySelector('[id=PlantRecipeManager]');
					if (!xmlPlants) {
						console.log('No plants purchased/unlocked');
					} else {
						xmlPlants = xmlPlants.getElementsByTagName('purchased')[0];
						oData = {};
						if (xmlPlants.childNodes.length > 0) {
							for (var i = 0; i < xmlPlants.childNodes.length; i++) {
								console.log(xmlPlants.childNodes[i].innerHTML);
							}
						} else {
							console.log('No plants purchased/unlocked');
						}
					}
				} catch(e) {
					console.error(e);
				}
				console.groupEnd();
				
				// Match brain locations to building locations
				try{
					var parser = CCIN('@mozilla.org/xmlextras/domparser;1', 'nsIDOMParser');
					var xmlBrainCount = parser.parseFromString(xml, 'text/xml');
					oData = {};
					for (var oEntity, i = 0; i < xmlBrainCount.firstChild.childNodes.length; i++) {
						oEntity = xmlBrainCount.firstChild.childNodes[i];
						var buildingID = oEntity.attributes.item('id').value;
						var numBrains = oEntity.innerHTML;
						var arrEntities = xmlCatalog.getElementsByTagName('Entity');
						for (var oEntity2, j = 0; j < arrEntities.length; j++) {
							oEntity2 = arrEntities[j];
							var entityID = oEntity2.attributes.item('id').value;
							if (entityID == buildingID) {
								var xmlGridItem = oEntity2.childNodes[1];
								var yCoord = xmlGridItem.firstChild.innerHTML;
								var xCoord = xmlGridItem.lastChild.innerHTML;
								var xmlBuildingLevel = oEntity2.childNodes[4];
								var buildingLevel = xmlBuildingLevel.firstChild.innerHTML;
								var buildingType = (buildingID == 'HouseMain') ? buildingID : oEntity2.attributes.getNamedItem('template').value;
								oData[buildingID] = { 'type':buildingType, 'level':Number(buildingLevel), 'braincount':Number(numBrains), 'coord':yCoord + ',' + xCoord};
								break;
							}
						}
					}
					var columns = [
						{property:'type', label: 'Location'},
						{property:'level', label: 'Building Level'},
						{property:'braincount', label: 'Brainz'},
						{property:'coord', label: 'Coordinates'},
					];
					console.table(oData, columns);
				} catch(e) {
					console.error(e);
				}
				
				console.groupEnd();
			}
		}
	},
	
    shutdown: function() {
		trace("shutdown");
		
		Firebug.Module.shutdown.apply(this, arguments);
		
		// Unregister NetInfoBody listener
        Firebug.NetMonitor.NetInfoBody.removeListener(this);
		
		// Unregister cache listener
		Firebug.TabCacheModel.removeListener(this);
    },
	
	showPanel: function(browser, panel) {
		if (panel && panel.name == "net") {
			// Append CSS
			var doc = panel.document;
			if ($("flashbugStyles", doc)) {
				// Don't append the stylesheet twice. 
			} else {
				var styleSheet = createStyleSheet(doc, "chrome://flashbug/skin/flashbug.css");
				styleSheet.setAttribute("id", "flashbugStyles");
				addStyleSheet(doc, styleSheet);
			}
		}
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends CacheListener
	
	shouldCacheRequest: function(request){
		return this.isAMF(safeGetContentType(request));
	},
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends NetInfoBody
	
    initTabBody: function(infoBox, file) {
		var request = file.request || file;
		//trace("initTabBody", file);
		if (this.isAMF(safeGetContentType(request))) {
			Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, this.tabId1, $FL_STR("flashbug.netInfoAMF.requestTitle"));
			Firebug.NetMonitor.NetInfoBody.appendTab(infoBox, this.tabId2, $FL_STR("flashbug.netInfoAMF.responseTitle"));
		}
	},
	
    destroyTabBody: function(infoBox, file) {},
	
    updateTabBody: function(infoBox, file, context) {
		// Get currently selected tab.
		var tab = infoBox.selectedTab;
		
		// Generate content only for the first time; and only if our tab has been just activated.
		if (tab.dataPresented || (!hasClass(tab, "netInfo" + this.tabId1 + "Tab") && !hasClass(tab, "netInfo" + this.tabId2 + "Tab"))) return;
		
		// Make sure the content is generated just once.
		tab.dataPresented = true;
		
		// Get body element associated with the tab.
		var isPostTab = hasClass(tab, "netInfo" + this.tabId1 + "Tab");
		var tabBody = isPostTab ? getElementByClass(infoBox, "netInfo" + this.tabId1 + "Text") : getElementByClass(infoBox, "netInfo" + this.tabId2 + "Text");
		
		if (isPostTab) {
			// Create container html
			//tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagPost.replace({}, tabBody, Flashbug.AMFInfoModule.NetInfoAMF);
			
			// Request
			if(!file.requestAMF) {
				if (file.postText) {
					var worker = new Worker("chrome://flashbug/content/lib/AMFWorker.js");
					var t = this;
					worker.onmessage = function(event) {
						if (event.data && event.data.type && event.data.type == 'debug') {
							var arr = event.data.message,
								title = arr.shift();
							t.trace('Worker trace - ' + title, arr);
						} else {
							t.trace('Worker post complete', event.data);
						
							file.requestAMF = event.data;
							tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagPost.replace({}, tabBody, Flashbug.AMFInfoModule.NetInfoAMF);
							Firebug.DOMPanel.DirTable.tag.replace({object: file.requestAMF, toggles: t.toggles}, getChildByClass(tabBody, 'flashbugAMFRequest'), Firebug.DOMPanel.DirTable);
						}
					};
					worker.onerror = function(error) {
						t.trace('Worker error post: ' + error.message, error);
						tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagPostError.replace({message:$FL_STR('flashbug.netInfoAMF.error.parse') + ': ' + file.href}, tabBody, Flashbug.AMFInfoModule.NetInfoAMF);
					};
					
					var postText = file.postText;
					var reHeaders = /^([^:]+):\s?(.*)[\r|\n]|\r?\n$|[\r\n]$/;
					var reCRLF = /^[\r\n]/;
					postText = postText.replace(reHeaders, ''); // Remove Referer header and one LF
					postText = postText.replace(reHeaders, ''); // Remove Content-type header and one LF
					postText = postText.replace(reHeaders, ''); // Remove Content-length header and one LF
					postText = postText.replace(reCRLF, ''); // Remove CRLF
					postText = postText.replace(reCRLF, ''); // Remove CRLF
					postText = postText.replace(reCRLF, ''); // Remove CRLF
					trace('postText', postText);
					worker.postMessage(postText);
				} else {
					tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagPostError.replace({message:$FL_STR('flashbug.netInfoAMF.error.load') + ': ' + file.href}, tabBody, Flashbug.AMFInfoModule.NetInfoAMF);
				}
			} else {
				tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagPost.replace({}, tabBody, Flashbug.AMFInfoModule.NetInfoAMF);
				Firebug.DOMPanel.DirTable.tag.replace({object: file.requestAMF, toggles: this.toggles}, getChildByClass(tabBody, 'flashbugAMFRequest'));
			}
		} else {
			// Create container html
			//tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagResponse.replace({}, tabBody);
			
			// Response
			if(!file.responseAMF) {
				if (file.responseText) {
					var worker = new Worker('chrome://flashbug/content/lib/AMFWorker.js');
					var t = this;
					worker.onmessage = function(event) {
						if (event.data.type == 'debug') {
							var arr = event.data.message,
								title = arr.shift();
							t.trace('Worker trace - ' + title, arr);
						} else {
							t.trace('Worker response complete', event.data);
						
							file.responseAMF = event.data;
							tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagResponse.replace({}, tabBody);
							Firebug.DOMPanel.DirTable.tag.replace({object: file.responseAMF, toggles: t.toggles}, getChildByClass(tabBody, 'flashbugAMFResponse'));
						}
					};
					worker.onerror = function(error) {
						t.trace('Worker error response: ' + error.message, error);
						
						tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagResponseError.replace({message:$FL_STR('flashbug.netInfoAMF.error.parse') + ': ' + file.href}, tabBody);
					};
					
					var responseText = file.responseText;
					trace('responseText', responseText);
					worker.postMessage(responseText);
				} else {
					tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagResponseError.replace({message:$FL_STR('flashbug.netInfoAMF.error.load') + ': ' + file.href}, tabBody);
				}
			} else {
				tabBody = Flashbug.AMFInfoModule.NetInfoAMF.tagResponse.replace({}, tabBody);
				Firebug.DOMPanel.DirTable.tag.replace({object: file.responseAMF, toggles: this.toggles}, getChildByClass(tabBody, 'flashbugAMFResponse'));
			}
		}
	},
	
	isAMF: function(contentType) {
		//trace(contentType + ' :: ' + AMF_MIME);
		if (!contentType) return false;
		if (contentType.indexOf(AMF_MIME) == 0) return true;
		return false;
	}
});

// ************************************************************************************************

Flashbug.AMFInfoModule.NetInfoAMF = domplate(Firebug.Rep, {
	inspectable: false,
	
	trace:Flashbug.AMFInfoModule.trace,
	
	tagPost:
		DIV({"role": "tabpanel"},
			DIV({"class": "netInfoHeadersGroup flb-amf-group"},
				SPAN($FL_STR("flashbug.netInfoAMF.dataTitle")),
                SPAN({"class": "netHeadersViewSource request", onclick: "$onSave", _rowName: "RequestAMF"},
                    $FL_STR("flashbug.netInfoAMF.save")
                )
			),
			DIV({class: "flashbugAMFRequest"})
		),
	
	tagResponse:
		DIV({"role": "tabpanel"},
			DIV({"class": "netInfoHeadersGroup flb-amf-group"},
				SPAN($FL_STR("flashbug.netInfoAMF.dataTitle")),
                SPAN({"class": "netHeadersViewSource response", onclick: "$onSave", _rowName: "ResponseAMF"},
                    $FL_STR("flashbug.netInfoAMF.save")
                )
			),
			DIV({class: "flashbugAMFResponse"})
		),
	
	tagError:
		DIV({"role": "tabpanel"}, "$message"),
		
	tagPostError:
		DIV({"role": "tabpanel"},
			DIV({"class": "netInfoHeadersGroup flb-amf-group"},
				SPAN($FL_STR("flashbug.netInfoAMF.errorTitle")),
                SPAN({"class": "netHeadersViewSource request", onclick: "$onSave", _rowName: "RequestAMF"},
                    $FL_STR("flashbug.netInfoAMF.save")
                )
			),
			DIV({"role": "tabpanel"}, "$message")
		),
		
	tagResponseError:
		DIV({"role": "tabpanel"},
			DIV({"class": "netInfoHeadersGroup flb-amf-group"},
				SPAN($FL_STR("flashbug.netInfoAMF.errorTitle")),
                SPAN({"class": "netHeadersViewSource response", onclick: "$onSave", _rowName: "ResponseAMF"},
                    $FL_STR("flashbug.netInfoAMF.save")
                )
			),
			DIV({"role": "tabpanel"}, "$message")
		),
	
	onSave: function(event) {
        var target = event.target;
        var requestAMF = (target.rowName == "RequestAMF");
        var netInfoBox = getAncestorByClass(target, "netInfoBody");
        var file = netInfoBox.repObject;
		var dir = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);
		var timestamp = file.startTime || (new Date()).getTime();
		var fileName = String(file.request.URI.host + "-" + timestamp);
		
		if(requestAMF) {
			// Request/Post
			var postText = file.postText;
			postText = postText.replace(/^([^:]+):\s?(.*)[\r|\n]|\r?\n$|[\r\n]$/gm, ""); // Remove headers and one LF
			postText = postText.replace(/[\r\n]/, ""); // Remove extra CRLF
			var file = this.getTargetFile(fileName + "-Post.amf");
			if(file) Flashbug.writeFile(file, postText);
		} else {
			// Response
			var responseText = file.responseText;
			var file = this.getTargetFile(fileName + "-Response.amf");
			if(file) Flashbug.writeFile(file, responseText);
		}
		
        cancelEvent(event);
    },
	
	getTargetFile: function(defaultFileName) {
        var nsIFilePicker = Ci.nsIFilePicker;
        var fp = CCIN("@mozilla.org/filepicker;1", "nsIFilePicker");
        fp.init(window, null, nsIFilePicker.modeSave);
        fp.appendFilter("AMF Files","*.amf");
        fp.appendFilters(nsIFilePicker.filterAll | nsIFilePicker.filterText);
        fp.filterIndex = 1;
        fp.defaultString = defaultFileName;
		
        var rv = fp.show();
        if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) return fp.file;
		
        return null;
    }
});

//////////////////////////
// Firebug Registration //
//////////////////////////

if (CCSV("@mozilla.org/preferences-service;1", "nsIPrefBranch2").getBoolPref(Firebug.prefDomain + ".flashbug.amf.enableAMF")) {
	Firebug.registerModule(Flashbug.AMFInfoModule);
}

/////////////////////////////
// Firebug Trace Constants //
/////////////////////////////

FBTrace.DBG_FLASH_AMF = Firebug.getPref(Firebug.prefDomain, "DBG_FLASH_AMF");

// Add flash mime types
try {
Firebug.NetMonitor.Utils.mimeCategoryMap["application/x-amf"] = "flash";
Firebug.NetMonitor.Utils.mimeCategoryMap["application/shockwave-flash"] = "flash";
Firebug.NetMonitor.Utils.mimeCategoryMap["application/x-futuresplash"] = "flash";
Firebug.NetMonitor.Utils.mimeCategoryMap["application/futuresplash"] = "flash";
} catch (e) { }

}});