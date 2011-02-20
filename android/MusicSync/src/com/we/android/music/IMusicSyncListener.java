package com.we.android.music;

import java.util.List;

public interface IMusicSyncListener {
    public void onFilesMissing(List<String> missingFiles);
    public void onDownloadStarted(String file);
    public void onProgressUpdate(int progress);
    public void onDownloadFinished(String file);
    public void onSyncFinished();
}
