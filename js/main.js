/*global define,document */
/*jslint sloppy:true,nomen:true */
/*
 | Copyright 2014 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/_base/array",
  "dojo/_base/fx",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/json",
  "dojo/number",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-style",
  "dojo/dom-geometry",
  "dojo/query",
  "dojo/on",
  "dojo/aspect",
  "dojo/Deferred",
  "dojo/promise/all",
  "put-selector/put",
  "dijit/registry",
  "dijit/form/ToggleButton",
  "dijit/Tooltip",
  "dijit/place",
  "dojox/charting/Chart",
  "dojox/charting/axis2d/Default",
  "dojox/charting/plot2d/Grid",
  "dojox/charting/themes/Bahamation",
  "dojox/charting/plot2d/Lines",
  "dojox/charting/action2d/MouseIndicator",
  "dojox/charting/action2d/TouchIndicator",
  "dojox/charting/widget/Legend",
  "dojox/charting/StoreSeries",
  "dojo/store/Memory",
  "esri/sniff",
  "esri/map",
  "esri/geometry/Point",
  "esri/geometry/Extent",
  "esri/graphic",
  "esri/layers/GraphicsLayer",
  "esri/layers/ArcGISTiledMapServiceLayer",
  "esri/layers/ArcGISImageServiceLayer",
  "esri/layers/ImageServiceParameters",
  "esri/layers/RasterFunction",
  "esri/layers/MosaicRule",
  "esri/dijit/LayerSwipe",
  "esri/dijit/Scalebar",
  "esri/toolbars/draw",
  "esri/tasks/Geoprocessor",
  "esri/tasks/FeatureSet"
], function (declare, lang, array, fx, Color, colors, json, number, dom, domClass, domStyle, domGeom,
             query, on, aspect, Deferred, all, put, registry, ToggleButton, Tooltip, place,
             Chart, Default, Grid, ChartTheme, Lines, MouseIndicator, TouchIndicator, ChartLegend, StoreSeries, Memory,
             esriSniff, Map, Point, Extent, Graphic, GraphicsLayer, ArcGISTiledMapServiceLayer,
             ArcGISImageServiceLayer, ImageServiceParameters, RasterFunction, MosaicRule,
             LayerSwipe, Scalebar, DrawToolbar, Geoprocessor, FeatureSet) {

  var MainApp = declare(null, {

    /**
     * BASEMAP LAYER URL
     */
    //basemapLayerUrl: "http://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer",
    basemapLayerUrl: "http://imagery.arcgisonline.com/arcgis/rest/services/LandsatGLS/GLS2010_Enhanced/ImageServer",

    /**
     * COLUMBIA GLACIER IMAGE SERVICE URL
     */
    columbiaGlacierImageServiceUrl: "http://maps.esri.com/apl15/rest/services/ArcticDEM/ColumbiaGlacier/ImageServer",

    /**
     * ANALYSIS SERVICES URLS
     */
    profileTaskUrl: "http://maps.esri.com/apl15/rest/services/ArcticDEM/Profile/GPServer/Profile",
    statsTaskUrl: "http://maps.esri.com/apl15/rest/services/ArcticDEM/VolumeDelta/GPServer/VolumeDelta",

    /**
     * CONSTRUCTOR
     *
     */
    constructor: function () {

      /**
       * DEFAULT PROFILE INFOS
       */
      this.defaultProfileInfos = {
        "2009": new Memory({idProperty: "distance", data: []}),
        "2013": new Memory({idProperty: "distance", data: []})
      };

    },

    /**
     * STARTUP
     */
    startup: function () {

      //this.toggleProfilePane(false);
      //this.toggleStatsPane(false);

      // GET COLORS //
      this.getColors();

      this.map = new Map("map-pane", {
        sliderPosition: "bottom-left",
        //basemap: "satellite",
        extent: new Extent({"xmin": -16402665.572775858, "ymin": 8649793.753135916, "xmax": -16346560.794014612, "ymax": 8673527.450418431, "spatialReference": {"wkid": 102100, "latestWkid": 3857}}),
        //center: [-147.0939363281225, 61.15569307841876],
        zoom: 12
      });
      this.map.on("load", lang.hitch(this, function () {
        //this.map.on("extent-change", lang.hitch(this, function (evt) {
        //console.info(json.stringify(evt.extent.toJson()));
        //}));

        // SCALEBAR //
        this.map.scalebar = new Scalebar({
          map: this.map,
          scalebarUnit: "dual"
        });

        // INIT OPERATIONAL LAYERS //
        this.initOperationalLayers().then(lang.hitch(this, function (operationalLayers) {
          this.operationalLayers = operationalLayers;

          // LAYERS NODE //
          var layersNode = dom.byId("layer-buttons-node");
          var layerCount = this.operationalLayers.length;

          // CREATE LAYER SWIPE AND VISIBILITY CONTROLS FOR EACH OPERATIONAL LAYER //
          this.layerSwipeDijits = array.map(this.operationalLayers, lang.hitch(this, function (operationalLayer, layerIndex) {
            var mapLayer = operationalLayer.layerObject;

            // LAYER SWIPE //
            var swipeWidget = new LayerSwipe({
              type: "vertical",
              map: this.map,
              left: (this.map.width * ((layerIndex + 1) / (layerCount + 1))),
              visible: operationalLayer.visibility,
              enabled: false,
              layers: [mapLayer]
            }, put(this.map.root, "-div"));
            swipeWidget.startup();

            // SWIPE LABEL //
            var handleNode = query(".handle", swipeWidget._moveableNode)[0];
            put(handleNode, "+div.movable-label", operationalLayer.title);

            // LAYER VISIBILITY TOGGLE BUTTON //
            var toggleLayerBtn = new ToggleButton({
              label: operationalLayer.title,
              checked: operationalLayer.visibility,
              iconClass: "dijitCheckBoxIcon"
            }, put(layersNode, "div"));
            toggleLayerBtn.startup();
            // LAYER VISIBILITY TOGGLE EVENT //
            toggleLayerBtn.on("change", lang.hitch(this, function (checked) {
              this.setLayerVisibility(mapLayer, checked);
              //mapLayer.setVisibility(checked);
              if(checked && registry.byId("toggle-swipe-btn").get("checked")) {
                swipeWidget.enable();
              } else {
                swipeWidget.disable();
              }
            }));

            // ASSOCIATE THE VISIBILITY AND SWIPE TOOLS //
            swipeWidget.toggleLayerBtn = toggleLayerBtn;

            return swipeWidget;
          }));

          // INIT SWIPE BUTTON //
          this.initSwipeButton();

          // DRAW TOOLBAR //
          this.drawToolbar = new DrawToolbar(this.map, {});
          this.drawToolbar.on("draw-end", lang.hitch(this, this.onDrawEnd));

          // INIT PROFILE TOOL //
          this.initProfileTool();

          // INIT STATS TOOL //
          this.initStatsTool();

          // INIT CLEAR BUTTON //
          this.initClearButton();

          // INIT ABOUT DIALOG //
          this.initAboutDialog();

          // CLEAR WELCOME MESSAGE //
          MainApp.displayMessage();
        }), MainApp.displayMessage);
      }));

      // ADD BASEMAP //
      //var basemapLayer = new ArcGISTiledMapServiceLayer(this.basemapLayerUrl);
      var basemapLayer = new ArcGISImageServiceLayer(this.basemapLayerUrl);
      this.map.addLayer(basemapLayer);

    },

    /**
     *  INITIALIZE ABOUT DIALOG
     */
    initAboutDialog: function () {
      on(dom.byId("about-node"), "click", lang.hitch(this, function (evt) {
        var aboutDialog = registry.byId("about-dialog");
        if(aboutDialog) {
          aboutDialog.show();
        }
      }));
    },

    /**
     *
     */
    getColors: function () {
      this.colors = {
        titleColor: domStyle.get("colors-title", "color"),
        accentColor: domStyle.get("colors-accent", "color"),
        primaryColor: domStyle.get("colors-primary", "color"),
        secondaryColor: domStyle.get("colors-secondary", "color"),
        primaryFill: domStyle.get("colors-primary", "backgroundColor"),
        secondaryFill: domStyle.get("colors-secondary", "backgroundColor")
      };
    },

    /**
     * SET LAYER VISIBILITY
     *  - USE A FADED ANIMATION AND DISABLE TOGGLE BUTTONS DURING ANIMATION
     *
     * @param mapLayer
     * @param checked
     */
    setLayerVisibility: function (mapLayer, checked) {
      //console.info(mapLayer, checked)

      if(mapLayer.layerFadeAnim) {
        mapLayer.layerFadeAnim.stop();
      }

      mapLayer.layerFadeAnim = fx[checked ? "fadeIn" : "fadeOut"]({
        node: mapLayer._div,
        duration: 1500,
        beforeBegin: lang.hitch(this, function () {
          if(checked) {
            mapLayer.setVisibility(checked);
          }
        }),
        onEnd: lang.hitch(this, function () {
          if(!checked) {
            mapLayer.setVisibility(checked);
          }
        })
      });
      mapLayer.layerFadeAnim.play();

    },

    /**
     * INITIALIZE OPERATIONAL LAYERS
     */
    initOperationalLayers: function () {
      var defer = new Deferred();

      // HILLSHADE RENDERING //
      var multiDirectionalShadedReliefFunction = new RasterFunction();
      multiDirectionalShadedReliefFunction.functionName = "MultiDirectionalShadedRelief_2";

      // 2009 ELEVATION //
      var elevation2009MosaicRule = new MosaicRule();
      elevation2009MosaicRule.method = MosaicRule.METHOD_LOCKRASTER;
      elevation2009MosaicRule.lockRasterIds = [1];

      var elevation2009Params = new ImageServiceParameters();
      elevation2009Params.mosaicRule = elevation2009MosaicRule;
      elevation2009Params.renderingRule = multiDirectionalShadedReliefFunction;

      var elevationLayer2009 = new ArcGISImageServiceLayer(this.columbiaGlacierImageServiceUrl, {
        imageServiceParameters: elevation2009Params
      });

      // 2013 ELEVATION //
      var elevation2013MosaicRule = new MosaicRule();
      elevation2013MosaicRule.method = MosaicRule.METHOD_LOCKRASTER;
      elevation2013MosaicRule.lockRasterIds = [2];

      var elevation2013Params = new ImageServiceParameters();
      elevation2013Params.mosaicRule = elevation2013MosaicRule;
      elevation2013Params.renderingRule = multiDirectionalShadedReliefFunction;

      var elevationLayer2013 = new ArcGISImageServiceLayer(this.columbiaGlacierImageServiceUrl, {
        imageServiceParameters: elevation2013Params
      });

      // RETURN OPERATIONAL LAYERS AFTER THEY'VE BEEN ADDED TO THE MAP //
      on.once(this.map, "layers-add-result", lang.hitch(this, function () {
        // OPERATIONAL LAYERS //
        var operationalLayers = [{
          title: "2009",
          layerObject: elevationLayer2009,
          visibility: true
        }, {
          title: "2013",
          layerObject: elevationLayer2013,
          visibility: true
        }];
        defer.resolve(operationalLayers);
      }));
      // ADD LAYERS //
      this.map.addLayers([elevationLayer2013, elevationLayer2009]);

      return defer.promise;
    },

    /**
     *  INIT SWIPE BUTTON
     */
    initSwipeButton: function () {
      registry.byId("toggle-swipe-btn").on("change", lang.hitch(this, function (checked) {
        array.forEach(this.layerSwipeDijits, lang.hitch(this, function (layerSwipeDijit) {
          var toggleChecked = layerSwipeDijit.toggleLayerBtn.get("checked");
          if(checked && toggleChecked) {
            layerSwipeDijit.enable();
          } else {
            layerSwipeDijit.disable();
          }
        }));
      }));
    },

    /**
     * INIT CLEAR BUTTON
     */
    initClearButton: function () {

      registry.byId("clear-btn").on("click", lang.hitch(this, function (evt) {

        if(this.profileHandle2009 && (!this.profileHandle2009.isFulfilled())) {
          this.profileHandle2009.cancel();
        }
        if(this.profileHandle2013 && (!this.profileHandle2013.isFulfilled())) {
          this.profileHandle2013.cancel();
        }
        if(this.statsTaskHandle && (!this.statsTaskHandle.isFulfilled())) {
          this.statsTaskHandle.cancel();
        }

        registry.byId("get-profile-btn").set("checked", false);
        registry.byId("get-stats-btn").set("checked", false);

        this.profileFeature.setGeometry(null);
        this.profileIndexLocationGraphic.setGeometry(null);
        this.statsFeature.setGeometry(null);
        this.drawToolbar.deactivate();
        this.map.enableMapNavigation();

        this.updateProfileChart(this.defaultProfileInfos, true);
        this.displayEquivalentsResults(this.defaultEquivalents);

      }));

    },

    /**
     * ENABLE ONE OF THE MAP TOOLS
     *
     * @param toolName
     * @param checked
     */
    enableMapTool: function (toolName, checked) {

      switch (toolName) {
        case "profile":
          //this.toggleProfilePane(checked);
          if(checked) {
            registry.byId("get-stats-btn").set("checked", false);
            this.profileFeature.setGeometry(null);
            this.profileIndexLocationGraphic.setGeometry(null);
            this.map.disableMapNavigation();
            this.drawToolbar.activate(DrawToolbar.LINE);
          } else {
            if(!registry.byId("get-stats-btn").get("checked")) {
              this.drawToolbar.deactivate();
              this.map.enableMapNavigation();
            }
          }
          break;

        case "stats":
          //this.toggleStatsPane(checked);
          if(checked) {
            registry.byId("get-profile-btn").set("checked", false);
            this.statsFeature.setGeometry(null);
            this.map.disableMapNavigation();
            this.drawToolbar.activate(DrawToolbar.CIRCLE);
          } else {
            if(!registry.byId("get-profile-btn").get("checked")) {
              this.drawToolbar.deactivate();
              this.map.enableMapNavigation();
            }
          }
          break;
      }
    },

    /**
     * TOGGLE PROFILES PANE
     *
     * @param display
     */
    toggleProfilePane: function (display) {

      var profilePaneNode = registry.byId("main-bottom-pane").domNode;
      /*if(!this.profilePaneBox) {
       this.profilePaneBox = domGeom.getContentBox(profilePaneNode);
       }*/

      domClass.toggle(profilePaneNode, "hidden-bottom-pane", !display);
      registry.byId("main-container").layout();

      /* if(display) {

       domStyle.set(profilePaneNode, "display", "block");
       fx.animateProperty({
       node: profilePaneNode,
       properties: {
       height: {start: 0, end: this.profilePaneBox.h}
       },
       onEnd: lang.hitch(this, function () {
       registry.byId("main-container").layout();
       })
       }).play();

       } else {

       fx.animateProperty({
       node: profilePaneNode,
       properties: {
       height: {start: this.profilePaneBox.h, end: 0}
       },
       onEnd: lang.hitch(this, function () {
       domStyle.set(profilePaneNode, "display", "none");
       registry.byId("main-container").layout();
       })
       }).play();

       }*/
    },

    /**
     * DRAW TOOLBAR DRAW END EVENT
     *
     * @param drawEndEvent
     */
    onDrawEnd: function (drawEndEvent) {
      if(registry.byId("get-profile-btn").get("checked")) {
        this.getProfile(drawEndEvent.geometry);
      } else {
        this.getStats(drawEndEvent.geometry);
      }
    },

    /**
     * INITIALIZE PROFILE TOOL
     */
    initProfileTool: function () {

      this.profileTask = new Geoprocessor(this.profileTaskUrl);
      this.profileTask.setOutSpatialReference(this.map.spatialReference);

      var profileSymbol = lang.clone(this.drawToolbar.lineSymbol);
      profileSymbol.setColor(new Color(this.colors.accentColor));
      profileSymbol.setWidth(5.0);
      this.drawToolbar.setLineSymbol(profileSymbol);

      var locationSymbol = lang.clone(this.drawToolbar.markerSymbol);
      locationSymbol.setColor(new Color(this.colors.secondaryFill));
      locationSymbol.outline.setColor(new Color(this.colors.titleColor));
      locationSymbol.setSize(12.0);
      this.profileIndexLocationGraphic = new Graphic(null, locationSymbol);
      this.map.graphics.add(this.profileIndexLocationGraphic);

      this.profileFeature = new Graphic(null, profileSymbol, {OID: 1});
      this.map.graphics.add(this.profileFeature);

      this.profileFeatureSet = new FeatureSet();
      this.profileFeatureSet.features = [this.profileFeature];

      var drawProfileBtn = registry.byId("get-profile-btn");
      drawProfileBtn.on("change", lang.hitch(this, function (checked) {
        this.enableMapTool("profile", checked);
      }));

      this.initProfileChart();
    },

    /**
     * GET ELEVATION PROFILE FROM GP SERVICE
     *
     * @param profileLine
     */
    getProfile: function (profileLine) {
      this.map.setMapCursor("wait");

      if(this.profileHandle2009 && (!this.profileHandle2009.isFulfilled())) {
        this.profileHandle2009.cancel();
      }
      if(this.profileHandle2013 && (!this.profileHandle2013.isFulfilled())) {
        this.profileHandle2013.cancel();
      }

      // SET PROFILE INPUT GEOMETRY //
      this.profileFeature.setGeometry(profileLine);
      this.profileIndexLocationGraphic.setGeometry(null);

      // PROFILES PARAMS //
      var profileParams = {
        "InputLineFeatures": this.profileFeatureSet,
        "ProfileIDField": "OID",
        "returnZ": true,
        "returnM": true
      };
      // CALL PROFILE GP SERVICE //
      this.profileHandle2009 = this.profileTask.execute(lang.mixin(profileParams, {DEMResolution: "2009"})).then(lang.hitch(this, this._extractProfileInfo), lang.hitch(this, this._handleProfileError, "2009"));
      this.profileHandle2013 = this.profileTask.execute(lang.mixin(profileParams, {DEMResolution: "2013"})).then(lang.hitch(this, this._extractProfileInfo), lang.hitch(this, this._handleProfileError, "2013"));
      // WAIT FOR BOTH PROFILES TO BE READY AND THEN DISPLAY THE PROFILES CHART //
      all({"2009": this.profileHandle2009, "2013": this.profileHandle2013}).then(lang.hitch(this, this.updateProfileChart), console.warn);

    },

    /**
     * EXTRACT PROFILE INFORMATION FROM PROFILE FEATURE
     *
     * @param response
     * @returns {Array}
     * @private
     */
    _extractProfileInfo: function (response) {
      var profileFeatureSet = response[0].value;
      var profileFeature = profileFeatureSet.features[0];
      var coords = profileFeature.geometry.paths[0];
      return new Memory({
        idProperty: "distance",
        data: array.map(coords, lang.hitch(this, function (coord, coordIndex) {
          return {distance: (coord[3] || coordIndex), elevation: (coord[2] || 0.0), coord: coord, index: coordIndex}
        }))
      });
    },

    /**
     * HANDLE ERROR FROM PROFILE SERVICE
     *
     * @param demRes
     * @param error
     * @private
     */
    _handleProfileError: function (demRes, error) {
      this.map.setMapCursor("default");

      if(error.dojoType && (error.dojoType === "cancel")) {
        console.warn(demRes, error.message, error);
      } else {
        this.profileFeature.setGeometry(null);
        this.profileIndexLocationGraphic.setGeometry(null);
        this.updateProfileChart(this.defaultProfileInfos, true);
        alert("Invalid line, please make sure you draw the line within the boundary of the elevation layers");
      }
    },

    /**
     * INITIALIZE PROFILE CHART
     */
    initProfileChart: function () {

      var chartNode = dom.byId("profile-chart-node");
      this.profileChart = new Chart(chartNode);
      this.profileChart.setTheme(ChartTheme);

      var axisStroke = {color: this.colors.secondaryColor, width: 1};
      var indicatorStroke = {color: this.colors.secondaryColor, width: 1};

      this.profileChart.fill = this.colors.primaryFill;
      this.profileChart.theme.plotarea.fill = this.colors.primaryFill;
      this.profileChart.theme.axis.stroke = axisStroke;
      this.profileChart.theme.indicator.lineStroke = indicatorStroke;

      this.profileChart.addAxis("x", {
        title: "Distance (meters)",
        titleFontColor: this.colors.primaryColor,
        titleOrientation: "away",
        natural: true,
        includeZero: true,
        fixUpper: "none",
        majorTicks: true,
        minorTicks: true,
        majorTick: axisStroke,
        minorTick: axisStroke,
        fontColor: this.colors.primaryColor,
        font: "normal normal normal 9pt Open Sans"
      });
      this.profileChart.addAxis("y", {
        title: "Elevation (meters)",
        titleFontColor: this.colors.primaryColor,
        vertical: true,
        fixUpper: "minor",
        includeZero: true,
        majorTicks: true,
        minorTicks: false,
        majorTick: axisStroke,
        fontColor: this.colors.primaryColor,
        font: "normal normal normal 9pt Open Sans"
      });

      this.profileChart.addPlot("grid", {
        type: Grid,
        hMajorLines: true,
        hMinorLines: false,
        vMajorLines: false,
        vMinorLines: false,
        majorHLine: {
          color: this.colors.primaryColor,
          width: 0.5
        }
      });

      this.profileChart.addPlot("default", {
        type: Lines,
        tension: "S"
      });

      this.profileChart.addSeries("2009", [], {
        stroke: {color: Color.named.lightgreen, width: 2.5}
      });
      this.profileChart.addSeries("2013", [], {
        stroke: {color: Color.named.salmon, width: 2.5}
      });

      // INDICATOR PROPERTIES //
      // https://github.com/dojo/dojox/blob/master/charting/action2d/MouseIndicator.js
      // https://dojotoolkit.org/reference-guide/1.10/dojox/gfx-visual-properties.html
      var indicatorProperties = {
        series: "2009",
        mouseOver: true,
        font: "normal normal normal 13pt Open Sans",
        fontColor: this.colors.titleColor,
        fill: this.colors.secondaryFill,
        stroke: {color: this.colors.titleColor},
        markerFill: this.colors.secondaryFill,
        markerStroke: {color: this.colors.titleColor},
        markerSymbol: "m-6,0 c0,-8 12,-8 12,0 m-12,0 c0,8 12,8 12,0",
        labels: true,
        labelFunc: lang.hitch(this, function (dataPoint) {
          if(this.profileInfos) {
            var item2009 = this.profileInfos["2009"].get(dataPoint.x);
            var item2013 = this.profileInfos["2013"].get(dataPoint.x);
            this.updateProfileLocation(item2009.coord);
            var details = {
              elev2009: item2009.elevation.toFixed(1),
              elev2013: item2013.elevation.toFixed(1),
              diff: (item2013.elevation - item2009.elevation).toFixed(2)
            };
            return lang.replace("  2009: {elev2009}m  --  2013: {elev2013}m  --  Change: {diff}m  ", details);
          }
        })
      };

      // MOUSE/TOUCH INDICATOR //
      var indicator = new (esriSniff("has-touch") ? TouchIndicator : MouseIndicator)(this.profileChart, "default", indicatorProperties);

      /**
       * http://stackoverflow.com/questions/23399578/can-dojo-mouseindicator-be-html-and-not-just-plain-text
       */
      /*var shown = false;
       var tooltip = new Tooltip();
       on(mouseIndicator, "Change", lang.hitch(this, function (evt) {
       if(evt.label) {
       if(this.profileInfos) {
       var item2009 = this.profileInfos["2009"].get(evt.start.x);
       var item2013 = this.profileInfos["2013"].get(evt.start.x);
       this.updateProfileLocation(item2009.coord);
       var details = {
       elev2009: item2009.elevation.toFixed(1),
       elev2013: item2013.elevation.toFixed(1),
       diff: (item2013.elevation - item2009.elevation).toFixed(2)
       };
       var label = lang.replace("  2009: {elev2009}m  --  2013: {elev2013}m  --  Change: <b>{diff}m</b>  ", details);

       var yAxis = this.profileChart.getAxis("y");
       var around = this.profileChart.getPlot("default").toPage({x: evt.start.x, y: yAxis.scaler.bounds.to});
       around.w = 1;
       around.h = 1;
       tooltip.label = label;
       tooltip.position = ["above-centered"];
       if(!shown) {
       shown = true;
       tooltip.open(around);
       } else {
       Tooltip._masterTT.containerNode.innerHTML = tooltip.label;
       place.around(Tooltip._masterTT.domNode, around, ["above-centered"]);
       }
       }
       } else {
       // hide
       tooltip.close();
       shown = false;
       }
       }));*/


      this.profileChart.render();
      this.profileChart.empty = true;
      this._displayProfileMessage();

      aspect.after(registry.byId("main-bottom-pane"), "resize", lang.hitch(this, function () {
        this.profileChart.resize();
        this._displayProfileMessage();
      }), true);

      this.chartLegend = new ChartLegend({chart: this.profileChart}, "profile-chart-legend-node");
      domClass.add(this.chartLegend.domNode, "dijitHidden");
    },

    /**
     * UPDATE PROFILE INDEX LOCATION ON MAP
     *
     * @param coords
     */
    updateProfileLocation: function (coords) {
      var mapLocation = coords ? new Point(coords, this.map.spatialReference) : null;
      this.profileIndexLocationGraphic.setGeometry(mapLocation);
    },

    /**
     * DISPLAY PROFILE CHART
     *
     * @param profileInfos
     * @param clear
     * @private
     */
    updateProfileChart: function (profileInfos, clear) {
      this.map.setMapCursor("default");

      // CURRENT PROFILE INFOS //
      this.profileInfos = profileInfos;
      this.profileChart.empty = clear;

      // UPDATE PROFILE SERIES //
      array.forEach(Object.keys(profileInfos), lang.hitch(this, function (key) {
        var newStore = profileInfos[key];
        this.profileChart.updateSeries(key, newStore ? new StoreSeries(newStore, {query: {}}, {x: "distance", y: "elevation"}) : []);
      }));

      // UPDATE PROFILE CHART //
      this.profileChart.fullRender();
      this.chartLegend.refresh();
      domClass.toggle(this.chartLegend.domNode, "dijitHidden", (clear != null));
      this._displayProfileMessage();
    },

    /**
     * DISPLAY A MESSAGE OVER THE PROFILE CHART
     *
     * @private
     */
    _displayProfileMessage: function () {
      if(this.profileChart && this.profileChart.empty) {
        this.profileChart.surface.createText({
          x: (this.profileChart.dim.width * 0.5),
          y: (this.profileChart.dim.height * 0.5),
          align: "middle",
          text: "Columbia Glacier Elevation Profile"
        }).setFont({family: "Open Sans", style: "normal", size: "19pt"}).setFill(this.colors.secondaryColor);
      }
    },

    /**
     * INITIALIZE STATISTICS TOOL
     */
    initStatsTool: function () {

      this.statsTask = new Geoprocessor(this.statsTaskUrl);
      this.statsTask.setOutSpatialReference(this.map.spatialReference);

      var statsSymbol = lang.clone(this.drawToolbar.fillSymbol);
      var statsColor = new Color(this.colors.accentColor);
      statsColor.a = 0.3;
      statsSymbol.setColor(statsColor);

      statsSymbol.outline.setColor(new Color(this.colors.accentColor));
      statsSymbol.outline.setWidth(5.0);
      this.drawToolbar.setFillSymbol(statsSymbol);

      this.statsFeature = new Graphic(null, statsSymbol, {OID: 1});
      this.map.graphics.add(this.statsFeature);

      this.statsFeatureSet = new FeatureSet();
      this.statsFeatureSet.features = [this.statsFeature];

      var getStatsBtn = registry.byId("get-stats-btn");
      getStatsBtn.on("change", lang.hitch(this, function (checked) {
        this.enableMapTool("stats", checked);
      }));

      this.getDefaultStats();
    },

    /**
     * TOGGLE STATISTICS PANE
     *
     * @param display
     */
    toggleStatsPane: function (display) {
      var statsPaneNode = registry.byId("main-right-pane").domNode;
      domClass.toggle(statsPaneNode, "hidden-side-pane", !display);
      registry.byId("main-container").layout();
    },

    /**
     * GET DEFAULT STATISTICS
     */
    getDefaultStats: function () {
      var statParams = {inPolygon: json.stringify({"geometryType": "esriGeometryPolygon", "sr": {"wkid": 102100}, "features": []})};
      this.statsTaskHandle = this.statsTask.execute(statParams).then(lang.hitch(this, function (response) {
        this.defaultEquivalents = response[0].value;
        this.displayEquivalentsResults(this.defaultEquivalents);
      }));
    },

    /**
     * GET STATS BASED ON SEARCH AREA
     *
     * @param searchArea
     */
    getStats: function (searchArea) {
      this.map.setMapCursor("wait");

      if(this.statsTaskHandle && (!this.statsTaskHandle.isFulfilled())) {
        this.statsTaskHandle.cancel();
      }

      this.statsFeature.setGeometry(searchArea);

      var statParams = {
        inPolygon: this.statsFeatureSet
      };
      this.statsTaskHandle = this.statsTask.execute(statParams).then(lang.hitch(this, function (response) {
        this.map.setMapCursor("default");
        var statisticsResults = response[0].value;
        this.displayEquivalentsResults(statisticsResults);
      }), lang.hitch(this, function (error) {
        this.map.setMapCursor("default");
        this.statsFeature.setGeometry(null);
        if(error.dojoType && (error.dojoType === "cancel")) {
          console.warn(error.message, error);
        } else {
          this.displayEquivalentsResults(this.defaultEquivalents);
          alert("Invalid area, please make sure you draw the area within the boundary of the elevation layers");
        }
      }));

    },

    /**
     * DISPLAY STATISTIC RESULTS
     *
     * @param results
     */
    displayEquivalentsResults: function (results) {
      var equivalentNode = dom.byId("equivalent-node");
      equivalentNode.innerHTML = "";

      this._displayGlacierDetails(equivalentNode, results.glacier);

      array.forEach(results.equivalents, lang.hitch(this, function (details) {
        this._displayEquivalentDetails(equivalentNode, details);
      }));
    },

    /**
     * DISPLAY GLACIER DETAILS
     *
     * @param parentNode
     * @param details
     * @private
     */
    _displayGlacierDetails: function (parentNode, details) {

      var glacierTable = put(parentNode, "table.glacier-item", {border: 0, width: "100%"});
      put(glacierTable, "tr td.equivalent-title.title-color.accent-border-color", {colSpan: "2", align: "left", innerHTML: "Glacier"});
      put(glacierTable, "tr td.equivalent-icon.cg-glacier.accent-color", {rowSpan: "5", align: "center"});
      put(glacierTable, "tr td.equivalent-count.title-color", {align: "right", innerHTML: this._formatNumber(details.area)});
      put(glacierTable, "tr td.equivalent-details", {align: "right", innerHTML: details.areaunits});
      put(glacierTable, "tr td.equivalent-count.title-color", {align: "right", innerHTML: this._formatNumber(details.volume)});
      var gain = (details.volume > 0) ? "positive" : ((details.volume < 0) ? "negative" : "none");
      put(glacierTable, lang.replace('tr td.equivalent-details.volume[gain="{0}"]', [gain]), {align: "right", innerHTML: details.volumeunits});

    },

    /**
     * DISPLAY EQUIVALENT DETAILS
     *
     * @param parentNode
     * @param details
     * @private
     */
    _displayEquivalentDetails: function (parentNode, details) {

      var equivalentTable = put(parentNode, "table.equivalent-item", {border: 0, width: "100%"});
      put(equivalentTable, "tr td.equivalent-title.title-color.accent-border-color", {colSpan: "2", align: "left", innerHTML: details.name});
      var middleRow = put(equivalentTable, "tr");
      put(middleRow, lang.replace("td.equivalent-icon.cg-{type}.accent-color", details), {rowSpan: "2", align: "center", valign: "top"});
      put(middleRow, "td.equivalent-count.title-color", {align: "right", innerHTML: this._formatNumber(details.count)});
      put(equivalentTable, "tr td.equivalent-details", {colSpan: "2", align: "right", innerHTML: details.details});

    },

    /**
     *
     * @param value
     * @returns {*}
     * @private
     */
    _formatNumber: function (value) {
      return isNaN(value) ? value : number.format(value);
    }

  });

  /**
   *  DISPLAY MESSAGE OR ERROR
   *
   * @param messageOrError {string | Error}
   */
  MainApp.displayMessage = function (messageOrError) {
    require(["dojo/query", "put-selector/put"], function (query, put) {
      query(".message-node").orphan();
      if(messageOrError) {
        if(messageOrError instanceof Error) {
          put(document.body, "div.message-node.error-node", messageOrError.message);
          console.error(messageOrError);
        } else {
          put(document.body, "div.message-node", messageOrError);
        }
      }
    });
  };

  MainApp.version = "0.0.1";

  return MainApp;
});
