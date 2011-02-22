package com.we.android.music;

import java.util.List;

public interface IMusicSyncControl {
    public void stop();
    public void registerSyncListener(IMusicSyncListener listener);
    public void unregisterSyncListener(IMusicSyncListener listener);
    public List<String> getMissingFiles();
}
