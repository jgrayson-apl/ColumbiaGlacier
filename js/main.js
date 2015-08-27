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
  "dojo/json",
  "dojo/number",
  "dojo/colors",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-geometry",
  "dojo/query",
  "dojo/on",
  "dojo/aspect",
  "dojo/Deferred",
  "dojo/promise/all",
  "put-selector/put",
  "dijit/registry",
  "dijit/form/ToggleButton",
  "dojox/charting/Chart",
  "dojox/charting/axis2d/Default",
  "dojox/charting/plot2d/Grid",
  "dojox/charting/themes/Bahamation",
  "dojox/charting/plot2d/Lines",
  "dojox/charting/action2d/MouseIndicator",
  "dojox/charting/widget/Legend",
  "dojox/charting/StoreSeries",
  "dojo/store/Memory",
  //"esri/arcgis/utils",
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
], function (declare, lang, array, fx, Color, json, number, colors, dom, domClass, domGeom, query, on, aspect, Deferred, all, put,
             registry, ToggleButton, Chart, Default, Grid, ChartTheme, Lines, MouseIndicator, ChartLegend, StoreSeries, Memory,
             /* arcgisUtils,*/ Map, Point, Extent, Graphic, GraphicsLayer, ArcGISTiledMapServiceLayer,
             ArcGISImageServiceLayer, ImageServiceParameters, RasterFunction, MosaicRule,
             LayerSwipe, Scalebar, DrawToolbar, Geoprocessor, FeatureSet) {

  var MainApp = declare(null, {

    /**
     * ANALYSIS SERVICES URLS
     */
    profileTaskUrl: "http://maps.esri.com/apl15/rest/services/ArcticDEM/Profile/GPServer/Profile",
    statsTaskUrl: "http://maps.esri.com/apl15/rest/services/ArcticDEM/VolumeDelta/GPServer/VolumeDelta",


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
     * EQUIVALENT ICON URLS
     */
    equivalentIcons: {
      "glacier": "./images/green/AGOL_Analysis_Icons_blue_defaultLandscape_32.png",
      "percapita": "./images/green/Facilities_65.png",
      "oiltanker": "./images/green/Ferry.png",
      "olympicpools": "./images/green/LasEditWater32.png",
      "bathtub": "./images/green/bathtub.png",
      "barrelsoil": "./images/green/Roadway_Reporter_Data_products.png"
    },

    /**
     * DEFAULT PROFILE INFOS
     */
    defaultProfileInfos: {"2009": new Memory({idProperty: "distance", data: []}), "2013": new Memory({idProperty: "distance", data: []})},

    /**
     * CONSTRUCTOR
     *
     */
    constructor: function (/*config*/) {
      //declare.safeMixin(this, config);
    },

    /**
     * STARTUP
     */
    startup: function () {

      this.map = new Map("map-pane", {
        //basemap: "satellite",
        extent: new Extent({"xmin": -16402665.572775858, "ymin": 8649793.753135916, "xmax": -16346560.794014612, "ymax": 8673527.450418431, "spatialReference": {"wkid": 102100, "latestWkid": 3857}}),
        //center: [-147.0939363281225, 61.15569307841876],
        zoom: 12
      });
      this.map.on("load", lang.hitch(this, function () {
        //this.map.on("extent-change", lang.hitch(this, function (evt) {
        //  console.info(json.stringify(evt.extent.toJson()));
        //}));

        // SCALEBAR //
        var scalebar = new Scalebar({
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

          // CLEAR WELCOME MESSAGE //
          MainApp.displayMessage();
        }), MainApp.displayMessage);
      }));

      // ADD BASEMAP //
      //var basemapLayer = new ArcGISTiledMapServiceLayer(this.basemapLayerUrl);
      var basemapLayer = new ArcGISImageServiceLayer(this.basemapLayerUrl);
      this.map.addLayers([basemapLayer]);

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
     * CREATE A MAP BASED ON AN WEBMAP ITEMINFO OR ID
     *
     * @param itemInfo
     * @private
     */
    /*
     _createWebMap: function (itemInfo) {
     arcgisUtils.createMap(itemInfo, "map-pane", {
     mapOptions: {},
     usePopupManager: true,
     editable: this.editable,
     bingMapsKey: this.bingKey
     }).then(lang.hitch(this, function (response) {

     // MAP //
     this.map = response.map;
     this.webmap = response.itemInfo.itemData;

     this.map.on("extent-change", lang.hitch(this, function (evt) {
     console.info(lang.replace("center:[{0},{1}],level:{2}", [evt.extent.getCenter().getLongitude(), evt.extent.getCenter().getLatitude(), evt.lod.level]));
     }));

     // SCALEBAR //
     var scalebar = new Scalebar({
     map: this.map,
     scalebarUnit: "dual"
     });

     // LAYERS NODE //
     var layersNode = dom.byId("layer-buttons-node");
     var layerCount = this.webmap.operationalLayers.length;

     // CREATE LAYER SWIPE AND VISIBILITY CONTROLS FOR EACH OPERATIONAL LAYER //
     this.layerSwipeDijits = array.map(this.webmap.operationalLayers.reverse(), lang.hitch(this, function (operationalLayer, layerIndex) {
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
     mapLayer.setVisibility(checked);
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

     // CLEAR WELCOME MESSAGE //
     MainApp.displayMessage();
     }), MainApp.displayMessage);
     },
     */

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
    enableMapTool: function (/*String*/toolName, /*Boolean*/checked) {

      switch (toolName) {
        case "profile":
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
      profileSymbol.setColor(new Color(Color.named.gold));
      profileSymbol.setWidth(5.0);
      this.drawToolbar.setLineSymbol(profileSymbol);

      var locationSymbol = lang.clone(this.drawToolbar.markerSymbol);
      locationSymbol.setColor(new Color("#ccc"));
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
      this.profileChart.fill = "#dadada";
      this.profileChart.theme.plotarea.fill = "#dadada";
      this.profileChart.addAxis("x", {
        title: "Distance (meters)",
        titleOrientation: "away",
        natural: true,
        includeZero: true,
        fixUpper: "none",
        minorTicks: true,
        font: "normal normal 9pt Tahoma"
      });
      this.profileChart.addAxis("y", {
        title: "Elevation (meters)",
        vertical: true,
        fixUpper: "minor",
        includeZero: true,
        minorTicks: false,
        font: "normal normal 9pt Tahoma"
      });

      this.profileChart.addPlot("grid", {
        type: Grid,
        hMajorLines: true,
        hMinorLines: false,
        vMajorLines: false,
        vMinorLines: false,
        majorHLine: {
          color: "#666",
          width: 0.5
        }
      });

      this.profileChart.addPlot("default", {
        type: Lines,
        tension: "S"
      });

      this.profileChart.addSeries("2009", [], {
        stroke: {color: Color.named.green, width: 2.5}
      });
      this.profileChart.addSeries("2013", [], {
        stroke: {color: Color.named.red, width: 2.5}
      });

      // MOUSE INDICATOR //
      var mouseIndicator = new MouseIndicator(this.profileChart, "default", {
        series: "2013",
        mouseOver: true,
        font: "normal normal normal 13pt Tahoma",
        markerSymbol: "m-6,0 c0,-8 12,-8 12,0 m-12,0 c0,8 12,8 12,0",
        fillFunc: function () {
          return Color.named.white;
        },
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
      });

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
          text: "Columbia Glacier Elevations Profile"
        }).setFont({family: "Tahoma", style: "normal", size: "27pt"}).setFill("#ccc");
      }
    },

    /**
     * INITIALIZE STATISTICS TOOL
     */
    initStatsTool: function () {

      this.statsTask = new Geoprocessor(this.statsTaskUrl);
      this.statsTask.setOutSpatialReference(this.map.spatialReference);

      var statsSymbol = lang.clone(this.drawToolbar.fillSymbol);
      statsSymbol.setColor(new Color(Color.named.yellow.concat(0.3)));
      statsSymbol.outline.setColor(new Color(Color.named.gold));
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
      put(glacierTable, "tr td.equivalent-title", {colSpan: "2", align: "left", innerHTML: "Glacier"});
      var iconNode = put(glacierTable, "tr td.equivalent-icon", {rowSpan: "5", align: "center"});
      put(iconNode, "img", {src: this.equivalentIcons["glacier"]});
      put(glacierTable, "tr td.equivalent-count", {align: "right", innerHTML: this._formatNumber(details.area)});
      put(glacierTable, "tr td.equivalent-details", {align: "right", innerHTML: details.areaunits});
      put(glacierTable, "tr td.equivalent-count", {align: "right", innerHTML: this._formatNumber(details.volume)});
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
      put(equivalentTable, "tr td.equivalent-title", {colSpan: "2", align: "left", innerHTML: details.name});
      var middleRow = put(equivalentTable, "tr");
      var iconNode = put(middleRow, "td.equivalent-icon", {rowSpan: "2", align: "center", valign: "top"});
      put(iconNode, "img", {src: this.equivalentIcons[details.type]});
      put(middleRow, "td.equivalent-count", {align: "right", innerHTML: this._formatNumber(details.count)});
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
