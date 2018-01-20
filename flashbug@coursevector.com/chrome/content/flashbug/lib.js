
top.Flashbug = {};

(function() {

	// Constants
	const Cc = Components.classes;
	const Ci = Components.interfaces;
	const NS_SEEK_SET = Ci.nsISeekableStream.NS_SEEK_SET;
	
	var t = this;
	
	this.QI = function(obj, iface) {
		return obj.QueryInterface(iface);
	};
	
	this.CCSV = function(cName, ifaceName) {
		try {
			return Cc[cName].getService(Ci[ifaceName]);  // if fbs fails to load, the error can be Cc[cName] has no properties
		} catch(exc) {
			Components.utils.reportError(cName+'@'+ifaceName+' FAILED '+exc);
			if (!Cc[cName]) {
				Components.utils.reportError('No Components.classes entry for '+cName);
			} else if (!Ci[ifaceName]) {
				Components.utils.reportError('No Components.interfaces entry for '+ifaceName);
			}
		}
	};
	
	var stringBundle;
	this.getStringBundle = function() {
        if (!stringBundle) stringBundle = document.getElementById('strings_flashbug');
        return stringBundle;
    }
	
	var defaultStringBundle;
	this.getDefaultStringBundle = function() {
		if (!defaultStringBundle) {
			var ioService = t.CCSV('@mozilla.org/network/io-service;1', 'nsIIOService');
			var chromeRegistry = t.CCSV('@mozilla.org/chrome/chrome-registry;1', 'nsIChromeRegistry');
			var stringBundleService = t.CCSV('@mozilla.org/intl/stringbundle;1', 'nsIStringBundleService');
			var bundle = document.getElementById('strings_flashbug');
			var uri = ioService.newURI(bundle.src, 'UTF-8', null);
			var fileURI = chromeRegistry.convertChromeURL(uri).spec;
			var parts = fileURI.split('/');
			parts[parts.length - 2] = 'en-US';
			defaultStringBundle = stringBundleService.createBundle(parts.join('/'));
		}
		
		return defaultStringBundle;
	}
	
	this.$FL_STR = function(name) {
		var strKey = name.replace(' ', '_', "g");
		var useDefaultLocale = prefService.getBoolPref('extensions.firebug.useDefaultLocale');
		if (!useDefaultLocale) {
			try {
				return t.getStringBundle().getString(strKey);
			} catch (err) {
				t.trace("Flashbug Missing translation for: " + name + "\n");
				t.trace("Flashbug getString FAILS ", err);
			}
		} else {
			try {
				// The en-US string should be always available.
				var bundle = t.getDefaultStringBundle();
				return bundle.GetStringFromName(strKey);
			} catch (err) {
				t.trace("Flashbug $FL_STR (default) FAILS '" + name + "'", err);
			}
		}
	}
	
	
	this.$FL_STRF = function(name, args) {
		var strKey = name.replace(' ', '_', "g");
		var useDefaultLocale = Firebug.getPref(Firebug.prefDomain, "useDefaultLocale");
		if (!useDefaultLocale) {
			try {
				return t.getStringBundle().formatStringFromName(strKey, args);
			} catch (err) {
				t.trace("Flashbug Missing translation for: " + name + "\n");
				t.trace("Flashbug getString FAILS ", err);
			}
		} else {
			try {
				// The en-US string should be always available.
				var bundle = t.getDefaultStringBundle();
				return bundle.formatStringFromName(strKey, args, args.length);
			} catch (err) {
				t.trace("Flashbug $FL_STRF (default) FAILS '" + name + "'", err);
			}
		}
	}
	
	this.internationalize = function(element, attr) {
		if (typeof element == 'string') element = document.getElementById(element);
	
		if (element) {
			var xulString = element.getAttribute(attr);
			if (xulString) {
				var localized = t.$FL_STR(xulString);
				
				// Set localized value of the attribute.
				if(element.localName == 'p') {
					element.removeAttribute(attr);
					element.innerHTML = localized;
				} else {
					element.setAttribute(attr, localized);
				}
			}
		} else {
			t.trace('Failed to internationalize element with attr '+attr+' args:'+args);
		}
	}
	
	this.internationalizeElements = function(doc, elements, attributes) {
		for (var i = 0; i < elements.length; i++) {
			var element = doc.getElementById(elements[i]);
			if (!element) continue;
			
			for (var j=0; j<attributes.length; j++) {
				if (element.hasAttribute(attributes[j])) t.internationalize(element, attributes[j]);
			}
		}
	}
	
	const promptService = this.CCSV('@mozilla.org/embedcomp/prompt-service;1', 'nsIPromptService');
	this.alert = function(body, title) {
		// Firefox 3.0+
		//var alertService = this.CCSV('@mozilla.org/alerts-service;1', 'nsIAlertsService');
		//alertService.showAlertNotification('chrome://clearcache/skin/logo_32.png', title, body, false, '', null);
		if(!title) title = 'Error';
		promptService.alert(null, title, body);
		
		// Information bar popup
		// https://developer.mozilla.org/en/XUL/Method/appendNotification
		/*notificationBox.appendNotification(body, 'clearcache-notebox', icon, notificationBox.PRIORITY_INFO_MEDIUM);*/
	};
	
	this.getPostText = function(file, context) {
		var postText;
		
		postText = this.readPostTextFromRequest(file.request);
		
		if (!postText && context) {
			postText = this.readPostTextFromPage(file.href, context);
		}
		
		return postText;
	};
	
	this.readPostTextFromPage = function(url, context) {
		if (url == context.browser.contentWindow.location.href)	{
			try	{
				var webNav = context.browser.webNavigation;
				var descriptor = this.QI(webNav, Ci.nsIWebPageDescriptor).currentDescriptor;
				var entry = this.QI(descriptor, Ci.nsISHEntry);
				if (entry && entry.postData) {
					var postStream = this.QI(entry.postData, Ci.nsISeekableStream);
					postStream.seek(NS_SEEK_SET, 0);
					
					return this.readFromStream(postStream);
				}
			} catch (exc) {
				this.trace('readPostTextFromPage FAILS, url:'+url, exc);
			}
		}
	};
	
	this.readPostTextFromRequest = function(request) {
		try {
			var input = this.QI(request, Ci.nsIUploadChannel).uploadStream;
			if (input) {
				var ss = this.QI(input, Ci.nsISeekableStream);
				var prevOffset;
				if (ss) {
					prevOffset = ss.tell();
					ss.seek(NS_SEEK_SET, 0);
				}
				
				var text = this.readFromStream(input);
				
				// Seek locks the file so, seek to the beginning only if necko hasn't read it yet,
				// since necko doesn't seek to 0 before reading (at lest not till 459384 is fixed).
				if (ss && prevOffset == 0) ss.seek(NS_SEEK_SET, 0);
				
				return text;
			}
		} catch (e) {
			this.trace('readPostTextFromRequest FAILS for ' + request, e);
		}
		
		return null;
	};
	
	this.getResponseText = function(url) {
		// Copied from sourceCache.loadFromCache without UTF8
		try {
			var channel = this.CCSV('@mozilla.org/network/io-service;1', 'nsIIOService').newChannel(url, null, null);
			var input = channel.open();
			return this.readFromStream(input);
		} catch (e) {
			this.trace('getResponseText FAILS for ' + url, e);
		}
		
		return null;
	};
	
	this.getResponseText2 = function(file, context) {
		return context.sourceCache.loadText(file.href, file.method, file);
	};

	this.readFromStream = function(stream) {
		var sis = this.CCSV('@mozilla.org/binaryinputstream;1', 'nsIBinaryInputStream');
		sis.setInputStream(stream);
		
		var segments = [];
		for (var count = stream.available(); count; count = stream.available()) {
			segments.push(sis.readBytes(count));
		}
		
		sis.close();
		
		return segments.join('');
	};
	
	// Requests that the operating system attempt to open this file.
	// This is not available on all operating systems;
	this.launchFile = function(f) {
		try {
			f.launch();
		} catch (ex) {
			// If launch fails, try sending it through the system's external
			var uri = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService).newFileURI(f);
			var protocolSvc = Cc['@mozilla.org/uriloader/external-protocol-service;1'].getService(Ci.nsIExternalProtocolService);
			protocolSvc.loadUrl(uri);
		}
	}

	// Get the running operating system
	var os = null;
	this.getOS = function() {
		if(os == null) {
			var agt = navigator.userAgent.toLowerCase();
			// Cc['@mozilla.org/xre/app-info;1'].getService(Ci.nsIXULRuntime).OS
			// Inaccurate, OSX = Darwin, XP AND Vista = WINNT
			if(agt.indexOf('win') != -1) {
				if(agt.indexOf('windows nt 6') != -1) {
					os = 'winVista';
				} else {
					os = 'win';
				}
			} else if(agt.indexOf('macintosh') != -1) {
				os = 'mac';
			} else {
				os = 'linux';
			}
		}
		
		return os;
	};
	
	// Clear and write file
	this.writeFile = function(file, string, append) {
		var success = true;
		try {
			var fos = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(Ci.nsIFileOutputStream);
			// ioFlags
			// -1 defaults to PR_WRONLY 0x02 | PR_CREATE_FILE 0x08 | PR_TRUNCATE 0x20
			// Flashbug Old set to PR_RDWR 0x04 | PR_CREATE_FILE 0x08 | PR_TRUNCATE 0x20
			/*
			Name			Value	Description
			PR_RDONLY		0x01	Open for reading only.
			PR_WRONLY		0x02	Open for writing only.
			PR_RDWR			0x04	Open for reading and writing.
			PR_CREATE_FILE	0x08	If the file does not exist, the file is created. If the file exists, this flag has no effect.
			PR_APPEND		0x10	The file pointer is set to the end of the file prior to each write.
			PR_TRUNCATE		0x20	If the file exists, its length is truncated to 0.
			PR_SYNC			0x40	If set, each write will wait for both the file data and file status to be physically updated.
			PR_EXCL			0x80	With PR_CREATE_FILE, if the file does not exist, the file is created. If the file already exists, no action and NULL is returned.
			*/
			
			// perm ?|Owner|Group|Other
			// -1 defaults to 0664
			// Flashbug Old set to 755
			/*
			0 --- no permission
			1 --x execute 
			2 -w- write 
			3 -wx write and execute
			4 r-- read
			5 r-x read and execute
			6 rw- read and write
			7 rwx read, write and execute
			*/
			//is.init(file, -1, -1, 0);
			// Switched back to the old style, was a permissions issue. Maybe FlashTracer was to blame?
			if (append) {
				fos.init(file, 0x02|0x08|0x10, 0755, 0);
			} else {
				fos.init(file, 0x04|0x08|0x20, 0755, 0);
			}
			if(string && string.length > 0) {
				fos.write(string, string.length);
			} else {
				this.trace('writeFile : String is too short or empty', string);
			}
		} catch (e) {
			this.trace('writeFile : Error', e);
			success = false;
		} finally {
			if (fos) {
				if (fos instanceof Ci.nsISafeOutputStream) {
					fos.finish();
				} else {
					fos.close();
				}
			}
			return success;
		}
		
		return true;
	};
	
	// Get the Flash Player directory depending on OS
	var fpDirPath = null;
	this.getFlashPlayerDirectory = function() {
		var file, dir = Cc['@mozilla.org/file/directory_service;1'].createInstance(Ci.nsIProperties);
		if(fpDirPath == null) {
			switch(this.getOS()) {
				case 'win' :
				case 'winVista' :
					// C:\Documents and Settings\<user>\Application Data
					// C:\Users\<user>\AppData\Roaming
					file = dir.get('AppData', Ci.nsIFile);
					file.append('Macromedia');
					if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
					file.append('Flash Player');
					if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
					break;
				case 'mac' :
					// /User/<user>/Library/Preferences
					file = dir.get('UsrPrfs', Ci.nsIFile);
					file.append('Macromedia');
					if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
					file.append('Flash Player');
					if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
					break;
				case 'linux' :
					// /home/<user>
					file = dir.get('Home', Ci.nsIFile);
					file.append('.macromedia');
					if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
					//file.append('Macromedia');
					file.append('Flash_Player');
					if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
					break;
			}
			
			fpDirPath = file.path;
		} else {
			file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
			file.initWithPath(fpDirPath);
		}
		
		return file;
	};

	////////////////
	// Trust File //
	////////////////
	/*
	Windows all users:
	<system>\Macromed\Flash\FlashPlayerTrust (c:\WINDOWS\system32\Macromed\Flash\FlashPlayerTrust)
	
	Windows single user:
	<app data>\Macromedia\Flash Player\#Security\FlashPlayerTrust 
	Win XP (c:\Documents and Settings\<user>\Application Data\Macromedia\Flash Player\#Security\FlashPlayerTrust)
	Win Vista (c:\Users\<user>\AppData\Roaming\Macromedia\Flash Player\#Security\FlashPlayerTrust)
	
	Mac OS all users:
	<app support>/Macromedia/FlashPlayerTrust (/Library/Application Support/Macromedia/FlashPlayerTrust)
	
	Mac OS single user:
	<app data>/Macromedia/Flash Player/#Security/FlashPlayerTrust (/Users/<user>/Library/Preferences/Macromedia/Flash Player/#Security/FlashPlayerTrust)
	
	Linux all users:
	/etc/adobe/FlashPlayerTrust/
	
	Linux single user:
	/home/<user>/.macromedia/Flash_Player/#Security/FlashPlayerTrust
	/home/<user>/.macromedia/Macromedia/Flash_Player/#Security/FlashPlayerTrust/
	*/

	this.getTrustFile = function() {
		var file = this.getFlashPlayerDirectory();
		file.append('#Security');
		if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
		file.append('FlashPlayerTrust');
		if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
		file.append('flashbug.cfg');
		return file;
	};

	this.checkTrustFile = function() {
		var file = this.getTrustFile();
		var path = this.getTrustPath();
		var hasPath = false;
		
		try {
			if(file.exists && file.size != 0) {
				// read lines into array
				var str = '',
					fis = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream),
					line = {}, 
					lines = [], 
					hasmore = null;
				fis.init(file, 0x01, 00004, null);
				fis.QueryInterface(Ci.nsILineInputStream); 
				do {
					hasmore = fis.readLine(line);
					lines.push(line.value); 
				} while(hasmore);
				fis.close();
				
				var i = lines.length;
				while (i--) {
					var idx = lines[i].indexOf(path);
					if (idx > -1) hasPath = true;
					if (hasPath) break;
				}
			}
		} catch(e) {
			this.trace(e);
			return hasPath;
		}
		
		return hasPath;
	};
	
	this.getTrustPath = function() {
		var profDir = Cc['@mozilla.org/file/directory_service;1'].createInstance(Ci.nsIProperties).get('ProfD', Ci.nsIFile);
		profDir.append('extensions');
		profDir.append('flashbug@coursevector.com');
		profDir.append('chrome');
		return profDir.path;
	};

	this.saveTrustFile = function() {
		var file = this.getTrustFile();
		var path = this.getTrustPath();
		if (file.size != 0) path = '\n' + path;
		
		// Work with multiple profiles
		this.writeFile(file, path, true);
	};

	/////////////
	// MM File //
	/////////////
	var mmDirPath = null;
	const prefService = this.CCSV('@mozilla.org/preferences-service;1', 'nsIPrefBranch2');
	this.getMMDirectory = function() {
		var file = undefined,
			dir = Cc['@mozilla.org/file/directory_service;1'].createInstance(Ci.nsIProperties),
			useGlobalVariables = prefService.getBoolPref('extensions.firebug.flashbug.useGlobalVariables');
		if(mmDirPath == null) {
			switch(this.getOS()) {
				case 'win' :
					// Normally we would use Home here, but at my work we have it mapped to something else. So this manually figures it out.
					// C:\Documents and Settings\<user>
					// get('Home', Ci.nsIFile) - H:\ (What my work has it mapped to) C:\Documents and Settings\<user> (What it should be)
					// get('Pers', Ci.nsIFile) - C:\Documents and Settings\<user>\My Documents
					// get('Desk', Ci.nsIFile) - C:\Documents and Settings\<user>\Desktop
					// get('AppData', Ci.nsIFile) - C:\Documents and Settings\<user>\Application Data : C:\Users\<user>\AppData\Roaming
					
					if (useGlobalVariables) {
						file = dir.get('Home', Ci.nsIFile);
					} else {
						file = dir.get('AppData', Ci.nsIFile).parent;
					}
					break;
				case 'winVista' :
					// C:\Users\<user>
					// get('Home', Ci.nsIFile) - C:\Users\<user>
					// get('Pers', Ci.nsIFile) - C:\Users\<user>\Documents
					// get('Desk', Ci.nsIFile) - C:\Users\<user>\Desktop
					// get('AppData', Ci.nsIFile) - C:\Users\<user>\AppData\Roaming
					if (useGlobalVariables) {
						file = dir.get('Home', Ci.nsIFile);
					} else {
						file = dir.get('AppData', Ci.nsIFile).parent.parent;
					}
					break;
				case 'mac' :
					// On Mac OS X, Flash Player now looks for the mm.cfg file in your home directory(~), generally, /Users/<user>.
					// If one is not found, it looks for mm.cfg in /Library/Application Support/Macromedia. 
					// For previous versions of Flash Player, Flash Player ignored an mm.cfg file in your home directory /Users/<user>. 
					// For some users with an mm.cfg in their home directory, tracing to the flashlog.txt file will not work.
					
					// /Library/Application Support/Macromedia
					file = dir.get('LocDsk', Ci.nsIFile).parent;
					file.append('Application Support');
					if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
					file.append('Macromedia');
					if(!file.exists() || !file.isDirectory()) file.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
					
					// /Users/<user>
					//file = dir.get('Home', Ci.nsIFile);
					break;
				case 'linux' :
					// /home/<user>
					// get('Home', Ci.nsIFile) - /home/<user>
					// get('Pers', Ci.nsIFile) - null
					// get('Desk', Ci.nsIFile) - /home/<user>/Desktop
					// get('AppData', Ci.nsIFile) - null
					file = dir.get('Home', Ci.nsIFile);
					break;
			}
			
			mmDirPath = file.path;
		} else {
			file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsILocalFile);
			file.initWithPath(mmDirPath);
		}
		
		return file;
	};

	var mmFile = null;
	this.getMMFile = function() {
		if(mmFile == null || !mmFile.exists()) {
			mmFile = this.getMMDirectory();
			mmFile.append('mm.cfg');
			if(!mmFile.exists()) mmFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0777);
		}
		
		return mmFile;
	};

	/*
	Mac OSX: Flash Player first checks the user's home directory (~). If none is found, then Flash Player looks in /Library/Application Support/Macromedia
	Windows 95/98/ME: %HOMEDRIVE%\%HOMEPATH%
	Windows 2000/XP: C:\Documents and Settings\username
	Windows Vista: C:\Users\username
	Linux: /home/username
	
	http://jpauclair.net/2010/02/10/mmcfg-treasure/

	mm.cfg

	#flashlog
	TraceOutPutFileName
	ErrorReportingEnable=0 		# Enables the logging of error messages.  0/1
	TraceOutputFileEnable=0 	# Enables trace logging. 0/1
	MaxWarnings=100 			# Sets the number of warnings to log before stopping.
	
	#flashlog - undocumented
	TraceOutputBuffered=1 		# Traces will be buffered and write to disk multiple lines in one access
	# requires TraceOutputBuffered
	AS3Verbose=0 				# Traces detailed information about SWF ByteCode structure and Runtime parsing of the bytecode
	AS3Trace=0 					# Trace every single call to any function that is being called in the SWF at runtime
	AS3StaticProfile=0 			# Enables Just in Time Compiler (NanoJIT) logs.
	AS3DynamicProfile=0 		#  Shows dynamic information about the opcodes being called and gives statistic for each. The statistics include count, cycles, %count, %times and CPI

	#policyfiles
	PolicyFileLog=1   			# Enables policy file logging
	PolicyFileLogAppend=1  		# Optional; do not clear log at startup

	policyfiles.txt
	flashlog.txt
	*/
	this.saveMMFile = function(enableErrors, maxWarnings, enablePolicy, enablePolicyAppend, enableOutputBuff, enableVerbose, enableTrace, enableStatic, enableDynamic) {
		var flashLogPath = this.getLogFile().path;
		var str = '';
		str += '#flashlog';
		str += '\n# Beginning with the Flash Player 9,0,28,0 Update, Flash Player ignores the TraceOutputFileName property.';
		str += '\n# On Macintosh OS X, you should use colons to separate directories in the TraceOutputFileName path rather than slashes.';
		str += '\nTraceOutputFileName=' + flashLogPath + ' # Set TraceOutputFileName to override the default name and location of the log file';
		str += '\n';
		str += '\nErrorReportingEnable=' + enableErrors + ' # Enables the logging of error messages.  0/1';
		str += '\nTraceOutputFileEnable=1 # Enables trace logging. 0/1';
		str += '\nMaxWarnings=' + maxWarnings + ' # Sets the number of warnings to log before stopping.';
		str += '\n';
		str += '\n#flashlog - undocumented';
		str += '\nTraceOutputBuffered=' + enableOutputBuff + ' # Traces will be buffered and write to disk multiple lines in one access';
		str += '\nAS3Verbose=' + enableVerbose + ' # Traces detailed information about SWF ByteCode structure and Runtime parsing of the bytecode';
		str += '\nAS3Trace=' + enableTrace + ' # Trace every single call to any function that is being called in the SWF at runtime';
		str += '\nAS3StaticProfile=' + enableStatic + ' # Enables Just in Time Compiler (NanoJIT) logs.';
		str += '\nAS3DynamicProfile=' + enableDynamic + ' # Shows dynamic information about the opcodes being called and gives statistic for each. The statistics include count, cycles, %count, %times and CPI';
		str += '\n';
		str += '\n#policyfiles';
		str += '\nPolicyFileLog=' + enablePolicy + ' # Enables policy file logging';
		str += '\nPolicyFileLogAppend=' + enablePolicyAppend + ' # Optional; do not clear log at startup';
		
		return this.writeFile(this.getMMFile(), str);
	};
	
	this.readMMFile = function() {
		var file = this.getMMFile(),
			o = {};
		try {
			if(file.exists && file.size != 0) {
				var str = '',
					fis = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream),
					cis = Cc['@mozilla.org/intl/converter-input-stream;1'].createInstance(Ci.nsIConverterInputStream);
				fis.init(file, 0x01, 00004, null);
				cis.init(fis, 'UTF-8', 1024, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
				if(cis instanceof Ci.nsIUnicharLineInputStream) {
					var data = {},
					read = 0;
					do { 
						read = cis.readString(0xFFFFFFFF, data); // read as much as we can and put it in str.value
						str += data.value;
					} while (read != 0);
					
					cis.close();
				}
				fis.close();
				
				// Regex to populate settings
				var regex = /^ErrorReportingEnable=([01])/gm,
					result = regex.exec(str);
				o.enableErrors = Boolean(result[1] == 1);
				
				regex = /^MaxWarnings=(\d+)/gm;
				result = regex.exec(str);
				o.maxWarnings = +result[1];
				
				regex = /^TraceOutputBuffered=([01])/gm;
				result = regex.exec(str);
				o.traceOutputBuffered = Boolean(result[1] == 1);
				
				regex = /^AS3Verbose=([01])/gm;
				result = regex.exec(str);
				o.aS3Verbose = Boolean(result[1] == 1);
				
				regex = /^AS3Trace=([01])/gm;
				result = regex.exec(str);
				o.aS3Trace = Boolean(result[1] == 1);
				
				regex = /^AS3StaticProfile=([01])/gm;
				result = regex.exec(str);
				o.aS3StaticProfile = Boolean(result[1] == 1);
				
				regex = /^AS3DynamicProfile=([01])/gm;
				result = regex.exec(str);
				o.aS3DynamicProfile = Boolean(result[1] == 1);
				
				regex = /^PolicyFileLog=([01])/gm;
				result = regex.exec(str);
				o.enablePolicy = Boolean(result[1] == 1);
				
				regex = /^PolicyFileLogAppend=([01])/gm;
				result = regex.exec(str);
				o.enablePolicyAppend = Boolean(result[1] == 1);
			}
		} catch(e) {
			this.trace(e);
		}
		
		return o;
	};

	///////////////
	// Log Files //
	///////////////
	
	/*
	 Windows XP: C:\Documents and Settings\<user>\Application Data\Macromedia\Flash Player\Logs\flashlog.txt
	 Windows Vista: C:\Users\<user>\AppData\Roaming\Macromedia\Flash Player\Logs\flashlog.txt
	 OSX: /Users/<user>/Library/Preferences/Macromedia/Flash Player/Logs/flashlog.txt
	 Linux: home/<user>/.macromedia/Flash_Player/Logs/flashlog.txt
	*/

	var logFile = null;
	this.getLogFile = function() {
		if(logFile == null || !logFile.exists()) {
			logFile = this.getFlashPlayerDirectory();
			logFile.append('Logs');
			if(!logFile.exists() || !logFile.isDirectory()) logFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
			logFile.append('flashlog.txt');
			if(!logFile.exists()) logFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0777);
		}
		
		return logFile;
	};

	var polFile = null;
	this.getPolicyFile = function() {
		if(polFile == null || !polFile.exists()) {
			polFile = this.getFlashPlayerDirectory();
			polFile.append('Logs');
			if(!polFile.exists() || !polFile.isDirectory()) polFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0777);
			polFile.append('policyfiles.txt');
			if(!polFile.exists()) polFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0777);
		}
		
		return polFile;
	};
	
	// Trace Helpers
	//-----------------------------------------------------------------------------
	
	if (typeof FBTrace == 'undefined') FBTrace = { };
	
	this.trace = function(msg, obj) {
		if (FBTrace.DBG_FLASH) {
			if (typeof FBTrace.sysout == 'undefined') {
				Flashbug.alert(msg + ' | ' + obj);
			} else {
				FBTrace.sysout(msg, obj);
			}
		}
	};
	
}).apply(Flashbug);