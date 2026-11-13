package com.dwprod.superprod;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;
import com.getcapacitor.JSArray;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Home-screen widget: today's tasks, or the next days that have some.
 *
 * Data comes from the app as JSON ({day, title, rows[]}) and is kept in
 * SharedPreferences, so the widget keeps working while the app is closed.
 * Ticking a task off queues its id for the app to apply the next time it runs
 * and removes the row immediately.
 */
public class TasksWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "superprod_widget";
    static final String KEY_DATA = "data";
    static final String KEY_ACTIONS = "actions";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            manager.updateAppWidget(id, build(context, id));
        }
        manager.notifyAppWidgetViewDataChanged(widgetIds, R.id.widget_list);
    }

    static int immutableFlag() {
        return Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
    }

    static int mutableFlag() {
        return Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
    }

    static PendingIntent openApp(Context context, String uri, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        intent.setClass(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag());
    }

    static RemoteViews build(Context context, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_tasks);

        Intent service = new Intent(context, TasksWidgetService.class);
        service.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        service.setData(Uri.parse(service.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, service);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        views.setTextViewText(R.id.widget_title, readTitle(context));
        views.setOnClickPendingIntent(R.id.widget_title, openApp(context, "superprod://today", 1));
        views.setOnClickPendingIntent(R.id.widget_add, openApp(context, "superprod://add", 2));

        Intent menu = new Intent(context, WidgetMenuActivity.class);
        menu.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        views.setOnClickPendingIntent(
            R.id.widget_more,
            PendingIntent.getActivity(context, 3, menu, PendingIntent.FLAG_UPDATE_CURRENT | immutableFlag()));

        // One template serves every row; each row's views fill in what to do.
        Intent template = new Intent(context, WidgetActionActivity.class);
        views.setPendingIntentTemplate(
            R.id.widget_list,
            PendingIntent.getActivity(
                context, 4, template, PendingIntent.FLAG_UPDATE_CURRENT | mutableFlag()));
        return views;
    }

    static String readTitle(Context context) {
        try {
            JSONObject data = new JSONObject(prefs(context).getString(KEY_DATA, "{}"));
            return data.optString("title", "Today");
        } catch (JSONException e) {
            return "Today";
        }
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveData(Context context, String json) {
        prefs(context).edit().putString(KEY_DATA, json).apply();
    }

    /** Redraw every placed widget (after data changed). */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, TasksWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids.length == 0) return;
        for (int id : ids) {
            manager.updateAppWidget(id, build(context, id));
        }
        manager.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    /** A task was ticked off on the widget: queue it for the app and hide the row. */
    static void markDone(Context context, String taskId) {
        SharedPreferences prefs = prefs(context);
        try {
            JSONArray queue = new JSONArray(prefs.getString(KEY_ACTIONS, "[]"));
            queue.put(taskId);

            JSONObject data = new JSONObject(prefs.getString(KEY_DATA, "{}"));
            JSONArray rows = data.optJSONArray("rows");
            JSONArray kept = new JSONArray();
            if (rows != null) {
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.getJSONObject(i);
                    if (!taskId.equals(row.optString("id", ""))) kept.put(row);
                }
            }
            data.put("rows", kept);
            prefs.edit().putString(KEY_ACTIONS, queue.toString()).putString(KEY_DATA, data.toString()).apply();
        } catch (JSONException ignored) {
            // Corrupt prefs: drop them rather than crash the widget.
            prefs.edit().clear().apply();
        }
        refreshAll(context);
    }

    static JSArray drainActions(Context context) {
        SharedPreferences prefs = prefs(context);
        JSArray result = new JSArray();
        try {
            JSONArray queue = new JSONArray(prefs.getString(KEY_ACTIONS, "[]"));
            for (int i = 0; i < queue.length(); i++) result.put(queue.getString(i));
        } catch (JSONException ignored) {
            // Nothing usable queued.
        }
        prefs.edit().remove(KEY_ACTIONS).apply();
        return result;
    }
}
