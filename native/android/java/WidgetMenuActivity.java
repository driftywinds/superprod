package com.dwprod.superprod;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * The widget's ⋮ menu. Widgets cannot show popup menus, so this small dialog
 * (over a transparent activity) offers the same choices.
 */
public class WidgetMenuActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final String[] items = new String[] {"Refresh from app", "Open superprod"};
        new AlertDialog.Builder(this)
            .setItems(items, (dialog, which) -> {
                String target = which == 0 ? "superprod://refresh" : "superprod://today";
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                intent.setClass(this, MainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(intent);
                finish();
            })
            .setOnCancelListener(dialog -> finish())
            .show();
    }
}
