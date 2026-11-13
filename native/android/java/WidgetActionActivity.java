package com.dwprod.superprod;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Invisible trampoline for taps on widget rows. "done" completes without ever
 * showing UI; "open" launches the app on that task. An activity (rather than a
 * broadcast) is used so starting the app from a widget tap is always allowed.
 */
public class WidgetActionActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        String kind = intent.getStringExtra("kind");
        String id = intent.getStringExtra("id");

        if (id != null && !id.isEmpty()) {
            if ("done".equals(kind)) {
                TasksWidgetProvider.markDone(this, id);
            } else if ("open".equals(kind)) {
                Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("superprod://task/" + Uri.encode(id)));
                open.setClass(this, MainActivity.class);
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(open);
            }
        }
        finish();
    }
}
