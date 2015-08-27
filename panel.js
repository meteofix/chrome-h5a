/*
 * Copyright 2015 Ville Skyttä <ville.skytta@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function() {

    var currentData = {
        accessed: {},
        doctypes: {},
        elements: {},
        attributes: {},
        listeners: {},
    };
    var sessionData = {
        accessed: {},
        doctypes: {},
        elements: {},
        attributes: {},
        listeners: {},
    };

    function getSessionPlusCurrentData() {

        var combined = JSON.parse(JSON.stringify(sessionData)); // clone
        var key, value;

        for (key of Object.keys(currentData.accessed)) {
            value = sessionData.accessed[key] || 0;
            value += currentData.accessed[key];
            combined.accessed[key] = value;
        }

        for (key of Object.keys(currentData.doctypes)) {
            value = sessionData.doctypes[key] || 0;
            value += currentData.doctypes[key];
            combined.doctypes[key] = value;
        }

        for (key of Object.keys(currentData.elements)) {
            value = sessionData.elements[key] || 0;
            value += currentData.elements[key];
            combined.elements[key] = value;
        }

        for (key of Object.keys(currentData.attributes)) {
            value = sessionData.attributes[key] || 0;
            value += currentData.attributes[key];
            combined.attributes[key] = value;
        }

        for (key of Object.keys(currentData.listeners)) {
            value = sessionData.listeners[key] || 0;
            value += currentData.listeners[key];
            combined.listeners[key] = value;
        }

        return combined;
    }

    var injectedScript = function() {

        window.H5A = {
            data: {
                accessed: {},
                doctypes: {},
                elements: {},
                attributes: {},
                listeners: {},
            },
        };

        function addThing(stash, name) {
            if (!stash[name])
                stash[name] = 1;
            else
                stash[name]++;
        }

        function addScriptAccess(name, args) {
            var key = name;
            if (args !== undefined)
                key += "(" + Array.prototype.join.call(args, ", ") + ")";
            addThing(window.H5A.data.accessed, key);
        }

        function overrideFunction(name, func, withargs) {
            return function() {
                addScriptAccess(name, withargs ? arguments : undefined);
                return func.apply(this, arguments);
            };
        }

        // Geolocation

        navigator.geolocation.getCurrentPosition =
            overrideFunction("navigator.geolocation.getCurrentPosition",
                             navigator.geolocation.getCurrentPosition);
        navigator.geolocation.watchPosition =
            overrideFunction("navigator.geolocation.watchPosition",
                             navigator.geolocation.watchPosition);
        navigator.geolocation.clearWatch =
            overrideFunction("navigator.geolocation.clearWatch",
                             navigator.geolocation.clearWatch);

        // Application cache

        applicationCache.update =
            overrideFunction("applicationCache.update",
                             applicationCache.update);
        applicationCache.abort =
            overrideFunction("applicationCache.abort",
                             applicationCache.abort);
        applicationCache.swapCache =
            overrideFunction("applicationCache.swapCache",
                             applicationCache.swapCache);

        // WebSocket

        var OrigWebSocket = WebSocket;
        WebSocket = function() {
            addScriptAccess("WebSocket");
            if (arguments.length == 1)
                return new OrigWebSocket(arguments[0]);
            return new OrigWebSocket(arguments[0], arguments[1]);
        };

        // Server-sent Events

        var OrigEventSource = EventSource;
        EventSource = function() {
            addScriptAccess("EventSource");
            if (arguments.length == 1)
                return new OrigEventSource(arguments[0]);
            return new OrigEventSource(arguments[0], arguments[1]);
        };

        // Web Workers

        var OrigWorker = Worker;
        Worker = function() {
            addScriptAccess("Worker");
            return new OrigWorker(arguments[0]);
        };

        var OrigSharedWorker = SharedWorker;
        SharedWorker = function() {
            addScriptAccess("SharedWorker");
            if (arguments.length == 1)
                return new OrigSharedWorker(arguments[0]);
            return new OrigSharedWorker(arguments[0], arguments[1]);
        };

        // Web Storage

        // We don't have an easy way to proxy the API because its principal
        // usage is direct property access get/set. This implementation
        // tracks changes to the storage contents instead.
        // Also, in some cases accessing localStorage throws a security
        // error "Storage is disabled inside 'data:' URLs even though there's
        // no apparent data: URL involved so we catch and ignore them.

        var origLocalStorageJSON;
        var origSessionStorageJSON;
        try {
            origLocalStorageJSON = JSON.stringify(localStorage);
            origSessionStorageJSON = JSON.stringify(sessionStorage);
        }
        catch (e) {}

        window.H5A.probeWebStorage = function() {
            try {
                if (JSON.stringify(localStorage) != origLocalStorageJSON)
                    window.H5A.data.accessed.localStorage = 1;
                if (JSON.stringify(sessionStorage) != origSessionStorageJSON)
                    window.H5A.data.accessed.sessionStorage = 1;
            }
            catch (e) {}
        };

        // Media Capture and Streams

        navigator.webkitGetUserMedia =
            overrideFunction("navigator.webkitGetUserMedia",
                             navigator.webkitGetUserMedia);

        // WebRTC

        var OrigRTCSessionDescription = RTCSessionDescription;
        RTCSessionDescription = function() {
            addScriptAccess("RTCSessionDescription");
            if (arguments.length == 1)
                return new OrigRTCSessionDescription(arguments[0]);
            return new OrigRTCSessionDescription();
        };

        var OrigWebkitRTCPeerConnection = webkitRTCPeerConnection;
        webkitRTCPeerConnection = function() {
            addScriptAccess("webkitRTCPeerConnection");
            return new OrigWebkitRTCPeerConnection(arguments[0]);
        };

        // Media Source

        var OrigMediaSource = MediaSource;
        MediaSource = function() {
            addScriptAccess("MediaSource");
            return new OrigMediaSource();
        };

        // Event listeners

        // https://html.spec.whatwg.org/multipage/webappapis.html#events
        // ...minus HTML 4.01 %events
        // ...and some that are defined for specific HTML 4.01 elements

        // key = event
        // value = list of elements to which it applies (* = all)
        //         if first is "!", applies to all BUT the rest in values

        var events = {
            abort: ["*"],
            afterprint: ["body", "frameset"],
            autocomplete: ["*"],
            autocompleteerror: ["*"],
            beforeprint: ["body", "frameset"],
            beforeunload: ["body", "frameset"],
            blur: ["!", "a", "area", "body", "button", "frameset", "input",
                   "label", "select", "textarea"],
            cancel: ["*"],
            canplay: ["*"],
            canplaythrough: ["*"],
            change: ["!", "input", "select", "textarea" ],
            close: ["*"],
            contextmenu: ["*"],
            cuechange: ["*"],
            drag: ["*"],
            dragend: ["*"],
            dragenter: ["*"],
            dragexit: ["*"],
            dragleave: ["*"],
            dragover: ["*"],
            dragstart: ["*"],
            drop: ["*"],
            durationchange: ["*"],
            emptied: ["*"],
            ended: ["*"],
            error: ["!", "body", "frameset"],
            focus: ["!", "a", "area", "body", "button", "frameset", "input",
                    "label", "select", "textarea" ],
            hashchange: ["body", "frameset"],
            input: ["*"],
            invalid: ["*"],
            languagechange: ["body", "frameset"],
            load: ["!", "body", "frameset" ],
            loadeddata: ["*"],
            loadedmetadata: ["*"],
            loadstart: ["*"],
            message: ["body", "frameset"],
            mouseenter: ["*"],
            mouseleave: ["*"],
            mousewheel: ["*"],
            offline: ["body", "frameset"],
            online: ["body", "frameset"],
            pagehide: ["body", "frameset"],
            pageshow: ["body", "frameset"],
            pause: ["*"],
            play: ["*"],
            playing: ["*"],
            popstate: ["body", "frameset"],
            progress: ["*"],
            ratechange: ["*"],
            reset: ["!", "form" ],
            resize: ["!", "body", "frameset" ],
            scroll: ["!", "body", "frameset" ],
            seeked: ["*"],
            seeking: ["*"],
            select: ["!", "input", "textarea" ],
            show: ["*"],
            sort: ["*"],
            stalled: ["*"],
            storage: ["body", "frameset"],
            submit: ["!", "form"],
            suspend: ["*"],
            timeupdate: ["*"],
            toggle: ["*"],
            volumechange: ["*"],
            waiting: ["*"],
        };

        // There is getEventListeners(Node) in Chrome, but it's limited
        // to DevTools command line only :(
        var origAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function() {
            origAddEventListener.apply(this, arguments);
            var type = arguments[0];
            if (events[type]) {
                if (events[type][0] == "!") {
                    if (events[type].indexOf(this.localName) == -1)
                        addThing(window.H5A.data.listeners, type);
                }
                else if (events[type][0] == "*" ||
                         events[type].indexOf(this.localName) != -1)
                    addThing(window.H5A.data.listeners, type);
            }
        };

        // Canvas

        HTMLCanvasElement.prototype.getContext =
            overrideFunction("HTMLCanvasElement.getContext",
                             HTMLCanvasElement.prototype.getContext,
                             true);

        // Doctype

        window.H5A.probeDoctype = function() {
            var key = "non-HTML5";
            if (!document.doctype)
                key = "(no doctype)";
            else if (document.doctype.name == "html" &&
                     !document.doctype.publicId &&
                     (!document.doctype.systemId ||
                      document.doctype.systemId == "about:legacy-compat"))
                key = "HTML5";
            window.H5A.data.doctypes[key] = 1;
        };

        // HTML5 elements

        window.H5A.probeElements = function() {
            // TODO: math? svg? others?
            var elements = [
                "abbr", "audio", "article", "aside", "bdi", "canvas", "data",
                "article", "aside", "audio", "bdi", "canvas", "data",
                "datalist", "details", "dialog", "embed", "figcaption",
                "figure", "footer", "header", "hgroup", "keygen", "main",
                "mark", "menuitem", "meter", "nav", "output", "picture",
                "progress", "rp", "rt", "ruby", "section", "source", "summary",
                "template", "time", "track", "video", "wbr",
            ];
            for (var element of elements) {
                var matches = document.querySelectorAll(element);
                if (matches.length)
                    window.H5A.data.elements[element] = matches.length;
                else
                    delete window.H5A.data.elements[element];
            }
        };

        // HTML5 attributes

        var selectors = [
            // Global attributes:
            // https://html.spec.whatwg.org/multipage/dom.html#global-attributes
            // ...minus HTML 4.01 %coreattrs, %i18n
            "*[contenteditable]", "*[contextmenu]", "*[draggable]",
            "*[dropzone]", "*[hidden]", "*[itemid]", "*[itemprop]",
            "*[itemref]", "*[itemscope]", "*[itemtype]", "*[spellcheck]",
            "*[translate]",
            // a
            "a[download]", "a[ping]",
            // area
            "area[download]", "area[ping]",
            // button
            "button[autofocus]", "button[form]", "button[formaction]",
            "button[formenctype]", "button[formnovalidate]",
            "button[formtarget]", "button[menu]",
            // fieldset
            "fieldset[form]",
            // form
            "form[autocomplete]", "form[novalidate]",
            // html
            "html[manifest]",
            // iframe
            "iframe[allowfullscreen]", "iframe[sandbox]",
            "iframe[seamless]", "iframe[srcdoc]",
            // img
            "img[crossorigin]", "img[sizes]", "img[srcset]",
            // input
            "input[autocomplete]", "input[autofocus]", "input[dirname]",
            "input[form]", "input[formaction]", "input[formenctype]",
            "input[formmethod]", "input[formnovalidate]",
            "input[formtarget]", "input[height]", "input[inputmode]",
            "input[list]", "input[max]", "input[min]", "input[minlength]",
            "input[multiple]", "input[pattern]", "input[placeholder]",
            "input[required]", "input[step]", "input[width]",
            "input[type=color]", "input[type=date]", "input[type=datetime]",
            "input[type=datetime-local]", "input[type=email]",
            "input[type=month]", "input[type=number]", "input[type=range]",
            "input[type=search]", "input[type=tel]", "input[type=time]",
            "input[type=url]", "input[type=week]",
            // label
            "label[form]",
            // link
            "link[crossorigin]", "link[sizes]",
            "link[rel=author]", "link[rel=external]", "link[rel=icon]",
            "link[rel=license]", "link[rel=nofollow]",
            "link[rel=noreferrer]", "link[rel=pingback]",
            "link[rel=prefetch]", "link[rel=search]", "link[rel=sidebar]",
            "link[rel=tag]",
            // meta
            "meta[charset]",
            // object
            "object[form]", "object[typemustmatch]",
            // ol
            "ol[reversed]",
            // script
            "script[async]", "script[crossorigin]",
            // select
            "select[autocomplete]", "select[form]", "select[required]",
            // style
            "style[scoped]",
            // table
            "table[sortable]",
            // textarea
            "textarea[autocomplete]", "textarea[autofocus]",
            "textarea[dirname]", "textarea[form]", "textarea[inputmode]",
            "textarea[maxlength]", "textarea[minlength]",
            "textarea[placeholder]", "textarea[required]", "textarea[wrap]",
            // th
            "th[sorted]",
        ];

        // Add event selectors
        for (var event of Object.keys(events)) {
            if (events[event][0] == "!") {
                var not = "";
                for (var i = 1; i < events[event].length; i++)
                    not += ":not(" + events[event][i] + ")";
                selectors.push(not + "[on" + event + "]");
            }
            else {
                for (var element of events[event])
                    selectors.push(element + "[on" + event + "]");
            }
        }

        window.H5A.probeAttributes = function() {

            for (var selector of selectors) {
                var matches = document.querySelectorAll(selector);
                if (matches.length)
                    window.H5A.data.attributes[selector] = matches.length;
                else
                    delete window.H5A.data.attributes[selector];
            }

            // Custom data-* attributes, not directly doable with selectors?
            // ...and Chrome 43 does not support for...of for NodeLists etc
            // https://code.google.com/p/chromium/issues/detail?id=401699
            var elements = document.getElementsByTagName("*"), n = 0;
            for (var i = 0; i < elements.length; i++) {
                var attributes = elements[i].attributes;
                for (var j = 0; j < attributes.length; j++) {
                    if (attributes[j].name.startsWith("data-"))
                        n++;
                }
            }
            if (n)
                window.H5A.data.attributes["// custom data-* attribute"] = n;
            else
                delete window.H5A.data.attributes["// custom data-* attribute"];
        };
    };

    function doReload() {
        sessionData = getSessionPlusCurrentData();
        chrome.devtools.inspectedWindow.reload({
            ignoreCache: true,
            injectedScript: "(" + injectedScript + ")()",
        });
    }

    function doReport() {
        document.getElementById("results").style.display = "block";
        chrome.devtools.inspectedWindow.eval(
            "H5A.probeWebStorage();" +
                "H5A.probeDoctype();" +
                "H5A.probeElements();" +
                "H5A.probeAttributes();" +
                "H5A.data",
            function(result, exceptionInfo) {
                var error;
                if (exceptionInfo) {
                    error = exceptionInfo.value;
                }

                document.getElementById("error").textContent = error || "";

                if (error) {
                    result = {
                        accessed: {},
                        doctypes: {},
                        elements: {},
                        attributes: {},
                        listeners: {},
                    };
                }
                currentData = result;

                document.getElementById("accessed-current").textContent =
                    JSON.stringify(result.accessed, null, 4);
                document.getElementById("doctypes-current").textContent =
                    JSON.stringify(result.doctypes, null, 4);
                document.getElementById("elements-current").textContent =
                    JSON.stringify(result.elements, null, 4);
                document.getElementById("attributes-current").textContent =
                    JSON.stringify(result.attributes, null, 4);
                document.getElementById("listeners-current").textContent =
                    JSON.stringify(result.listeners, null, 4);

                var combined = getSessionPlusCurrentData();
                document.getElementById("accessed-session").textContent =
                    JSON.stringify(combined.accessed, null, 4);
                document.getElementById("doctypes-session").textContent =
                    JSON.stringify(combined.doctypes, null, 4);
                document.getElementById("elements-session").textContent =
                    JSON.stringify(combined.elements, null, 4);
                document.getElementById("attributes-session").textContent =
                    JSON.stringify(combined.attributes, null, 4);
                document.getElementById("listeners-session").textContent =
                    JSON.stringify(combined.listeners, null, 4);
            });
    }

    function doClearSession() {
        sessionData = {
            accessed: {},
            doctypes: {},
            elements: {},
            attributes: {},
            listeners: {},
        };
    }

    window.addEventListener("load", function() {
        document.getElementById("reload")
            .addEventListener("click", doReload);
        document.getElementById("report")
            .addEventListener("click", doReport);
        document.getElementById("clear")
            .addEventListener("click", doClearSession);
    });
})();
