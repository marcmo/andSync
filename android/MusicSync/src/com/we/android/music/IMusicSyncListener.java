package com.we.android.music;

public interface IMusicSyncListener {
    public void onDownloadStarted(String file);
    public void onProgressUpdate(int progress);
    public void onSyncFinished();
}
