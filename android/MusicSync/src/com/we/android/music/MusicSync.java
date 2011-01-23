package com.we.android.music;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Bundle;
import android.os.IBinder;
import android.view.View;
import android.view.View.OnClickListener;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MusicSync extends Activity implements ServiceConnection, IMusicSyncListener {
    private ProgressBar mProgress;
    private TextView mInfo;
    private TextView mPercentage;
    private Button mButton;
    private TextView mResult;
    private IMusicSyncControl mMusicSyncControl;

    @Override
    public void onCreate(Bundle savedInstanceState) {
	super.onCreate(savedInstanceState);
	setContentView(R.layout.main);
	
	mProgress = (ProgressBar) findViewById(R.id.progressbar);
	mInfo = (TextView) findViewById(R.id.info);
	mPercentage = (TextView) findViewById(R.id.percentage);
	mResult = (TextView) findViewById(R.id.result);
	mButton = (Button) findViewById(R.id.cancelbutton);
	mButton.setVisibility(View.VISIBLE);

	startService(new Intent(MusicSyncService.class.getName()));
	bindService(new Intent(MusicSyncService.class.getName()), this, Context.BIND_AUTO_CREATE);
    }

    @Override
    public void onServiceConnected(ComponentName name, IBinder service) {
	mMusicSyncControl = ((MusicSyncService.LocalBinder) service).getService();
	mMusicSyncControl.registerSyncListener(this);
	mMusicSyncControl.start();
	mButton.setOnClickListener(new OnClickListener() {
	    @Override
	    public void onClick(View v) {
		mMusicSyncControl.stop();
		mButton.setVisibility(View.GONE);
	    }
	});
    }

    @Override
    public void onServiceDisconnected(ComponentName name) {
    }

    @Override
    public void onDownloadStarted(String file) {
	mInfo.setText(file);
    }

    @Override
    public void onProgressUpdate(int progress) {
	mProgress.setProgress(progress);
	mPercentage.setText(progress + "%");
    }

    @Override
    public void onSyncFinished() {
	mResult.setText("all files synced !");
    }
}
