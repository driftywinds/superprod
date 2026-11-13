package com.dwprod.superprod;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
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
 *
 * canScheduleExactAlarms / openExactAlarmSettings: Android 12+ refuses exact
 * alarms unless the user allows "Alarms & reminders". Capacitor silently falls
 * back to an inexact alarm in that case, which the OS batches — reminders then
 * arrive minutes late. The app needs to see this state to warn about it.
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

    /** True when the OS will honour the exact time we ask for. */
    @PluginMethod
    public void canScheduleExactAlarms(PluginCall call) {
        boolean allowed;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            allowed = true;
        } else {
            AlarmManager alarmManager =
                (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            allowed = alarmManager != null && alarmManager.canScheduleExactAlarms();
        }
        JSObject result = new JSObject();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    /** Opens the system screen where the user grants exact-alarm access. */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception error) {
                call.reject("Could not open exact alarm settings: " + error.getMessage());
                return;
            }
        }
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
