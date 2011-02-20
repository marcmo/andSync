package com.we.android.music;

import java.io.File;

public interface IMusicSyncControl {
    public void syncFolder(File localFolder, String remoteSyncFolder, String user);
    public void stop();
    public void registerSyncListener(IMusicSyncListener listener);
}
