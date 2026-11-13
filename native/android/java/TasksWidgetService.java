package com.dwprod.superprod;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Feeds the widget's list from the JSON the app saved. */
public class TasksWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static class Row {
        boolean header;
        String id = "";
        String text = "";
        String right = "";
        boolean overdue;
    }

    static class Factory implements RemoteViewsFactory {
        private final Context context;
        private final List<Row> rows = new ArrayList<>();

        Factory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            rows.clear();
            try {
                JSONObject data = new JSONObject(
                    TasksWidgetProvider.prefs(context).getString(TasksWidgetProvider.KEY_DATA, "{}"));

                // After midnight the saved "today" is stale: say so instead of
                // showing yesterday's list as if it were current.
                String day = data.optString("day", "");
                String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
                if (!day.isEmpty() && !day.equals(today) && isOlder(day, today)) {
                    Row notice = new Row();
                    notice.header = true;
                    notice.text = "Open the app or use ⋮ → Refresh";
                    rows.add(notice);
                    return;
                }

                JSONArray array = data.optJSONArray("rows");
                if (array == null) return;
                for (int i = 0; i < array.length(); i++) {
                    JSONObject json = array.getJSONObject(i);
                    Row row = new Row();
                    row.header = "h".equals(json.optString("t"));
                    row.id = json.optString("id", "");
                    row.text = json.optString("text", "");
                    row.right = json.optString("right", "");
                    row.overdue = json.optBoolean("over", false);
                    rows.add(row);
                }
            } catch (JSONException ignored) {
                rows.clear();
            }
        }

        private static boolean isOlder(String day, String today) {
            // yyyy-MM-dd compares correctly as a string.
            return day.compareTo(today) < 0;
        }

        @Override
        public void onDestroy() {
            rows.clear();
        }

        @Override
        public int getCount() {
            return rows.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= rows.size()) return null;
            Row row = rows.get(position);

            if (row.header) {
                RemoteViews header = new RemoteViews(context.getPackageName(), R.layout.widget_section_item);
                header.setTextViewText(R.id.section_title, row.text);
                return header;
            }

            RemoteViews item = new RemoteViews(context.getPackageName(), R.layout.widget_task_item);
            item.setTextViewText(R.id.item_title, row.text);
            item.setTextViewText(R.id.item_right, row.right);
            item.setTextColor(R.id.item_right, row.overdue ? Color.parseColor("#E5484D") : Color.parseColor("#B0B0B0"));

            // Tapping the box completes; tapping anywhere else opens the task.
            Intent done = new Intent();
            done.putExtra("kind", "done");
            done.putExtra("id", row.id);
            item.setOnClickFillInIntent(R.id.item_check, done);

            Intent open = new Intent();
            open.putExtra("kind", "open");
            open.putExtra("id", row.id);
            item.setOnClickFillInIntent(R.id.item_root, open);
            return item;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 2;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
