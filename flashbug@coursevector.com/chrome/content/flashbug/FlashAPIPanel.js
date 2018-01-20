FBL.ns(function() { with (FBL) {

var $FL_STR = Flashbug.$FL_STR,
$FL_STRF = Flashbug.$FL_STRF;

// Constants
const panelName = 'flbInspectorAPI';
const panelTitle = $FL_STR('flashbug.inspPanel.details.title');
const parentPanelName = 'flbInspector';

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

var trace = function(msg, obj) {
	msg = 'Flashbug - Flash::' + msg;
	if (FBTrace.DBG_FLASH_INSPECTOR) {
		if (typeof FBTrace.sysout == 'undefined') {
			Flashbug.alert(msg + ' | ' + obj);
		} else {
			FBTrace.sysout(msg, obj);
		}
	}
}

function nameSort(a, b) {
	var nameA = a.name.toLowerCase(), nameB = b.name.toLowerCase();
	if (nameA < nameB) return -1;//sort string ascending
	if (nameA > nameB) return 1;
	return 0 //default return value (no sorting)
};

Flashbug.FlashAPIModule = extend(Firebug.Module, {
	
	// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	// Extends Module
	
	dispatchName: panelName,
	
	id:null
});

Flashbug.FlashAPIModule.APIGroups = domplate(Firebug.Rep, {
	tag:
		DIV({},
			FOR("group", "$groups",
				DIV({"class": "apiGroup", $opened: "$group.opened"},
					H1({"class": "cssComputedHeader groupHeader"},
						IMG({"class": "twisty"}),
						SPAN({"class": "cssComputedLabel"}, "$group.title")
					),
					TAG("$groupTag", {props: "$group.props"})
				)
			)
		),

	groupTag:
		TABLE({width: "100%" },
			TBODY({ },
				FOR("prop", "$props",
					TR({"class": " computedStyleRow", },
						TD({"class": "stylePropName apiCol1"}, "$prop.name"),
						TD({"class": "stylePropValue apiCol2"}, 
							TAG('$prop|getValueTag', {value: '$prop.value'})
						)
					)
				)
			)
		),
		
	getValueTag: function(prop) {
		if (prop.isURL == true) return this.linkTag;
		if (prop.isInherit == true) return this.inheritanceTag;
		return this.valueTag;
	},
	
	linkTag:
		A({ target:'_blank', href:'$value' }, '$value'),
	
	inheritanceTag:
		FOR('step', '$value',
			SPAN({}, '$step'),
			IMG({ 'class':'inheritArrow', style:'$step|getVisible' })
		),
		
	valueTag:
		SPAN({}, '$value'),
		
	propsTag:
		DIV({},
			FOR('group', '$groups',
				DIV({'class': 'apiGroup', $opened: '$group.opened'},
					H1({'class': 'cssComputedHeader groupHeader'},
						IMG({'class': 'twisty'}),
						SPAN({'class': 'cssComputedLabel'}, '$group.title')
					),
					TAG('$propsGroupTag', {props: '$group.props'})
				)
			)
		),

	propsGroupTag:
		TABLE({width: '100%' },
			TBODY({ },
				FOR('prop', '$props',
					TR({'class': 'computedStyleRow', },
						TD({'class': 'stylePropName apiCol1'}, 
							SPAN({}, '$prop.name'),
							SPAN({ 'class':'stylePropSub'}, ' : $prop.type')
						),
						TD({'class': 'stylePropValue apiCol2'}, 
							TAG('$prop|getEditTag', {obj: '$prop'})
						)
					)
				)
			)
		),
		
	dropdownTag:
		SELECT({ propType:'$obj.type', propName:'$obj.name', onchange:'$onBlur' },
			FOR('value', '$obj.allowed',
				TAG('$value|getSelected', {value: '$value'})
				//OPTION({ value:'$value.value', _selected: '$value.value,$obj.value|getSelected'}, '$value.name')
			)
		),
	
	trace:trace,
	
	optionSelectedTag: 
		OPTION({ value:'$value.value', selected: 'selected'}, '$value.name'),
		
	optionTag: 
		OPTION({ value:'$value.value' }, '$value.name'),
	
	getSelected: function(value) {
		if (value.selected == 'true') return this.optionSelectedTag;
		return this.optionTag;
		/*this.trace('getSelected ' + option + ' ; ' + value);
		if (option == value) return true;
		return false;*/
	},
		
	getVisible: function(step) {
		if (step == 'Object') return 'display:none;';
	},
		
	writeTag:
		INPUT({type:'text', placeholder:'[write-only]'}),
	
	editTag:
		INPUT({ value:'$obj.value', type:'text', propType:'$obj.type', propName:'$obj.name', onblur:'$onBlur'}),
		
	editTextTag:
		TEXTAREA({ propType:'$obj.type', propName:'$obj.name', onblur:'$onBlur'}, '$obj.value'),
		
	readTag:
		SPAN({ 'class':'readOnly'}, '$obj.value'),
		
	readObjectTag:
		DIV({propName:'$obj.name', "class": "apiGroup subGroup"},
			H1({"class": "cssComputedHeader groupHeader subGroupHeader"},
				IMG({"class": "twisty"}),
				SPAN({"class": "cssComputedLabel objectProp"}, "$obj.value")
			),
			TAG("$propsGroupTag", {props: "$obj.props"})
		),
		
	readTextTag:
		TEXTAREA({ 'class':'readOnly', propType:'$obj.type', propName:'$obj.name', onblur:'$onBlur', readonly:true}, '$obj.value'),
		
	onBlur: function(event) {
		var input = event.target,
			group = getAncestorByClass(input, 'subGroup');
		
		if (group) {
			// Sub prop
			Flashbug.FlashModule.send({
				command:"setSubProperty",
				id:Flashbug.FlashAPIModule.id,
				/* name, value, type, parentName */
				args: [
						input.getAttribute('propName'),
						input.value,
						input.getAttribute('propType'),
						group.getAttribute('propName')
					]
			});
		} else {
			// Regular prop
			Flashbug.FlashModule.send({
				command:"setProperty",
				id:Flashbug.FlashAPIModule.id,
				/* name, value, type */
				args: [
						input.getAttribute('propName'),
						input.value,
						input.getAttribute('propType')
					]
			});
		}
	},
		
	getEditTag: function(prop) {
		if (prop.props && prop.props.length > 0) return this.readObjectTag;
		if (prop.allowed && prop.allowed.length > 0) return this.dropdownTag;
		
		if (prop.name == 'htmlText' || prop.name == 'text') {
			if (prop.access == 'readonly') return this.readTextTag;
			if (prop.access == 'writeonly') return this.writeTag;
			return this.editTextTag;
		}
		
		if (prop.type != 'Object' && prop.type != 'Number' && prop.type != 'int' && prop.type != 'uint' && prop.type != 'Boolean' && prop.type != 'String') return this.readTag;
		if (prop.access == 'readonly') return this.readTag;
		if (prop.access == 'writeonly') return this.writeTag;
		return this.editTag;
	}
});

function FlashAPIPanel() { }
FlashAPIPanel.prototype = extend(Firebug.Panel, {
	
	//////////////////////////////////////////////////////////////////////////////////////////////
	// Shared Objects Panel																	 //
	//////////////////////////////////////////////////////////////////////////////////////////////
	
	////////////////////////////
	// Firebug Panel Override //
	////////////////////////////
	
	name: panelName,
	title: panelTitle,
	parentPanel:parentPanelName,
	order:30,
	
	initialize: function() {
		this.groupOpened = [];
		this.groupOpened[$FL_STR('flashbug.inspPanel.general.title')] = true;
		this.groupOpened[$FL_STR('flashbug.inspPanel.class.title')] = true;
		this.groupOpened[$FL_STR('flashbug.inspPanel.vars.title')] = true;
		this.groupOpened[$FL_STR('flashbug.inspPanel.props.title')] = true;
		this.groupOpened[$FL_STR('flashbug.inspPanel.inherit.title')] = true;
		
		this.onMouseDown = bind(this.onMouseDown, this);
		
		Firebug.Panel.initialize.apply(this, arguments);
	},
	
	/* getOptionsMenuItems: function()
	{
		return [
			{label: 'Sort alphabetically', type: 'checkbox', checked: Firebug.computedStylesDisplay == 'alphabetical',
					command: bind(this.toggleDisplay, this) },
			{label: 'Show Mozilla specific styles', type: 'checkbox', checked: Firebug.showMozillaSpecificStyles,
			command:  bindFixed(Firebug.togglePref, Firebug, 'showMozillaSpecificStyles') },
			'-',
			{label: 'Refresh', command: bind(this.refresh, this) }
		];
	},*/
	
	initializeNode: function(oldPanelNode) {
		this.panelNode.addEventListener('mousedown', this.onMouseDown, false);

		Firebug.Panel.initializeNode.apply(this, arguments);
	},

	destroyNode: function() {
		this.panelNode.removeEventListener('mousedown', this.onMouseDown, false);

		Firebug.Panel.destroyNode.apply(this, arguments);
	},
	
	show: function(state) {
		if (this.context.loaded && !this.location) { // wait for loadedContext to restore the panel
			// Append CSS
			var doc = this.panelNode.ownerDocument;
			if ($("flashbugFlashStyles", doc)) {
				// Don't append the stylesheet twice. 
			} else {
				var styleSheet = createStyleSheet(doc, "chrome://flashbug/skin/inspector.css");
				styleSheet.setAttribute("id", "flashbugFlashStyles");
				addStyleSheet(doc, styleSheet);
			}
		}
	},
	
	////////////////////
	// Flash Specific //
	////////////////////
	
	onMouseDown: function(event) {
		if (!isLeftClick(event)) return;
		
		var header = getAncestorByClass(event.target, 'cssComputedHeader');
		if (header) this.toggleNode(event);
	},

	toggleNode: function(event) {
		var group = getAncestorByClass(event.target, 'apiGroup'),
			groupName = group.getElementsByClassName('cssComputedLabel')[0].textContent;
			
		toggleClass(group, 'opened');
		if (!hasClass(group, 'subGroup')) this.groupOpened[groupName] = hasClass(group, 'opened');
	},
	
	update: function(id, target, targetName, targetPath, classInfo, inheritInfo, targetProperties, targetVariables) {
		Flashbug.FlashAPIModule.id = id;
		
		var groups = [];
		var className = classInfo.className ? classInfo.className : classInfo.packageName;
		
		// Object //
		////////////
		var group = {title: $FL_STR('flashbug.inspPanel.general.title'), props: []};
		group.props.push({name:$FL_STR('flashbug.inspPanel.name'), value: targetName});
		group.props.push({name:$FL_STR('flashbug.inspPanel.path'), value: targetPath});
		group.props.push({name:$FL_STR('flashbug.inspPanel.class'), value: className});
		group.opened = this.groupOpened[group.title];
		groups.push(group);
		
		// Class //
		///////////
		group = {title: $FL_STR('flashbug.inspPanel.class.title'), props: []};
		group.props.push({name:$FL_STR('flashbug.inspPanel.package'), value: (classInfo.className ? classInfo.packageName : '')});
		
		var type = '';
		type += classInfo.isDynamic ? 'dynamic ' : '';
		type += classInfo.isStatic ? 'static ' : '';
		type += classInfo.isFinal ? 'final ' : '';
		group.props.push({name:$FL_STR('flashbug.inspPanel.class'), value: 'public ' + type + 'class ' + className});
		//inherit = inherit.split('>>').join('<img src="chrome://flashbug/skin/inspector/inherit-arrow.gif" width="15" height="9" />');
		group.props.push({name:$FL_STR('flashbug.inspPanel.inheritance'), value:inheritInfo.split(' → '), isInherit:true});
		group.opened = this.groupOpened[group.title];
		groups.push(group);
		
		Flashbug.FlashAPIModule.APIGroups.tag.replace({groups: groups}, this.panelNode);
		
		// Variables //
		///////////////
		groups = [];
		group = {title:$FL_STR('flashbug.inspPanel.vars.title'), props:targetVariables};
		group.opened = this.groupOpened[group.title];
		if (group.props) group.props.sort(nameSort);
		if (group.props && group.props.length > 0) groups.push(group);
		
		// Properties //
		////////////////
		var classPath = classInfo.className != null ? classInfo.packageName + '::' + classInfo.className : classInfo.packageName;
		var groupBase = {title:$FL_STR('flashbug.inspPanel.props.title') , props: []};
		groupBase.opened = this.groupOpened[groupBase.title];
		var groupInherit = {title:$FL_STR('flashbug.inspPanel.inherit.title') , props: []};
		groupInherit.opened = this.groupOpened[groupInherit.title];
		
		for (var i = 0, l = targetProperties.length; i < l; ++i) {
			var p = targetProperties[i];
			group = (p.declaredBy == classPath) ? groupBase : groupInherit;
			group.props.push(p);
		}
		
		groupBase.props.sort(nameSort);
		groupInherit.props.sort(nameSort);

		if (groupBase.props.length > 0) groups.push(groupBase);
		if (groupInherit.props.length > 0) groups.push(groupInherit);
		
		Flashbug.FlashAPIModule.APIGroups.propsTag.append({groups: groups}, this.panelNode);
	},
	
	updateSWF: function(id, fileName, fileSize, url, swfVersion, targetProperties, targetVariables) {
		Flashbug.FlashAPIModule.id = id;
		
		var groups = [];
		
		// Object //
		////////////
		var group = {title: $FL_STR('flashbug.inspPanel.general.title'), props: []};
		group.props.push({name:$FL_STR('flashbug.inspPanel.filename'), value: fileName});
		group.props.push({name:$FL_STR('flashbug.inspPanel.filesize'), value: fileSize});
		group.props.push({name:$FL_STR('flashbug.inspPanel.url'), value: url, isURL:true});
		group.props.push({name:$FL_STR('flashbug.inspPanel.swfversion'), value: swfVersion});
		group.opened = this.groupOpened[group.title];
		groups.push(group);
		Flashbug.FlashAPIModule.APIGroups.tag.replace({groups: groups}, this.panelNode);
		
		// Variables //
		///////////////
		groups = [];
		group = {title:$FL_STR('flashbug.inspPanel.vars.title'), props:targetVariables};
		group.opened = this.groupOpened[group.title];
		if (group.props && group.props.length > 0) groups.push(group);
		
		// Properties //
		////////////////
		group = {title:$FL_STR('flashbug.inspPanel.props.title') , props:targetProperties};
		group.opened = this.groupOpened[group.title];
		if (group.props && group.props.length > 0) groups.push(group);
		
		Flashbug.FlashAPIModule.APIGroups.propsTag.append({groups: groups}, this.panelNode);
	}
	
});

//////////////////////////
// Firebug Registration //
//////////////////////////

//Firebug.registerModule(Flashbug.FlashAPIModule);
Firebug.registerPanel(FlashAPIPanel);

}});