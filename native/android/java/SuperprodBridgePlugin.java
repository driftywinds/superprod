package com.dwprod.superprod;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS ↔ native bridge for the home-screen widget.
 *
 * setWidgetData: the app pushes the model to show (JSON) and the widget redraws.
 * drainWidgetActions: returns, and clears, task ids the user ticked off on the
 * widget while the app was closed so the app can apply them.
 */
@CapacitorPlugin(name = "SuperprodBridge")
public class SuperprodBridgePlugin extends Plugin {

    @PluginMethod
    public void setWidgetData(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        TasksWidgetProvider.saveData(getContext(), json);
        TasksWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void drainWidgetActions(PluginCall call) {
        JSArray ids = TasksWidgetProvider.drainActions(getContext());
        JSObject result = new JSObject();
        result.put("taskIds", ids);
        call.resolve(result);
    }
}
