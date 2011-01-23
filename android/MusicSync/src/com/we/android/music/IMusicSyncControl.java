package com.we.android.music;

public interface IMusicSyncControl {
    public void start();
    public void stop();
    public void registerSyncListener(IMusicSyncListener listener);
}
