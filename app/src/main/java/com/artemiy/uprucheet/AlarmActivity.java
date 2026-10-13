package com.artemiy.uprucheet;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.lang.ref.WeakReference;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Полноэкранный экран сигнала поверх блокировки. */
public class AlarmActivity extends Activity {
    private static WeakReference<AlarmActivity> shown = new WeakReference<>(null);

    static void finishIfShown() {
        AlarmActivity a = shown.get();
        if (a != null && !a.isFinishing()) a.runOnUiThread(a::finish);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        shown = new WeakReference<>(this);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        build();
    }

    private void build() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.rgb(16, 20, 34));
        int pad = dp(28);
        root.setPadding(pad, pad, pad, pad);

        TextView time = text(new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date()), 64, Color.WHITE, true);
        TextView label = text("ВАЖНОЕ СОБЫТИЕ", 14, Color.rgb(255, 120, 110), true);
        label.setLetterSpacing(0.15f);
        String t = AlarmService.currentTitle;
        TextView title = text(t == null || t.isEmpty() ? "Напоминание" : t, 28, Color.WHITE, true);
        TextView body = text(AlarmService.currentText == null ? "" : AlarmService.currentText, 18, Color.rgb(200, 205, 220), false);

        root.addView(time);
        root.addView(space(16));
        root.addView(label);
        root.addView(space(8));
        root.addView(title);
        root.addView(space(8));
        root.addView(body);
        root.addView(space(40));

        Button stop = button("Отключить", Color.rgb(255, 90, 78));
        stop.setOnClickListener(v -> send(AlarmService.ACTION_STOP, 0));
        root.addView(stop, new LinearLayout.LayoutParams(dp(280), dp(64)));
        root.addView(space(14));

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        int[] mins = {5, 10, 30};
        for (int m : mins) {
            Button b = button("+" + m + " мин", Color.rgb(52, 60, 86));
            b.setOnClickListener(v -> send(AlarmService.ACTION_SNOOZE, m));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(88), dp(52));
            lp.setMargins(dp(4), 0, dp(4), 0);
            row.addView(b, lp);
        }
        root.addView(row);
        root.addView(space(10));
        root.addView(text("Отложить", 13, Color.rgb(150, 156, 175), false));
        setContentView(root);
    }

    private void send(String action, int minutes) {
        Intent i = new Intent(this, AlarmService.class).setAction(action);
        if (minutes > 0) i.putExtra("minutes", minutes);
        startService(i);
        finish();
    }

    @Override
    public void onBackPressed() {
        // Сигнал отключается только кнопкой.
    }

    @Override
    protected void onDestroy() {
        if (shown.get() == this) shown = new WeakReference<>(null);
        super.onDestroy();
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        v.setTextColor(color);
        v.setGravity(Gravity.CENTER);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        return v;
    }

    private Button button(String s, int color) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(32));
        b.setBackground(bg);
        return b;
    }

    private android.view.View space(int h) {
        android.view.View v = new android.view.View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(h)));
        return v;
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
