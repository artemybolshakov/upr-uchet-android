package com.artemiy.uprucheet;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Отдаёт системному установщику APK из папки обновлений (вместо androidx FileProvider — без внешних зависимостей).
 * Только чтение, только файлы .apk из getExternalFilesDir("updates"); доступ — по временному разрешению из Intent.
 */
public class ApkProvider extends ContentProvider {
    static final String AUTHORITY = "com.artemiy.uprucheet.apk";

    static Uri uriFor(File f) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath(f.getName()).build();
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        File f = getContext() == null ? null : Updates.file(getContext(), name);
        if (f == null) throw new FileNotFoundException(String.valueOf(name));
        return f;
    }

    @Override
    public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (mode != null && !mode.equals("r")) throw new SecurityException("только чтение");
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) { return Updates.APK_MIME; }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f;
        try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
        MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        c.addRow(new Object[]{f.getName(), f.length()});
        return c;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
}
