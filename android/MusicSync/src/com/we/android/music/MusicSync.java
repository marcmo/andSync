package com.we.android.music;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import android.app.ListActivity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Environment;
import android.os.IBinder;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MusicSync extends ListActivity implements ServiceConnection, IMusicSyncListener {
    class SynFolderAdapter extends BaseAdapter {
	private static final int PROGRESS_UNDFINED = -1;
	private File[] mLocalFileList;
	private List<String> mMissingFiles = new ArrayList<String>();
	private int mProgress = PROGRESS_UNDFINED;

	public SynFolderAdapter() {
	    mLocalFileList = mlocalSyncFolder.listFiles();
	}
	
	@Override
	public int getCount() {
	    return mLocalFileList.length + mMissingFiles.size();
	}
	
	public void refreshFolder(List<String> missingFiles) {
	    mLocalFileList = mlocalSyncFolder.listFiles();
	    mMissingFiles.clear();
	    mMissingFiles.addAll(missingFiles);
	    notifyDataSetChanged();
	}
	
	public void showProgress(int progress) {
	    mProgress = progress;
	    notifyDataSetChanged();
	}

	@Override
	public Object getItem(int position) {
	    return null;
	}

	@Override
	public long getItemId(int position) {
	    return 0;
	}

	@Override
	public View getView(int position, View convertView, ViewGroup parent) {
	    View view = null;
	    if (position < mLocalFileList.length) {
		view = getLayoutInflater().inflate(R.layout.listitem, parent, false);
		TextView text = (TextView) view.findViewById(R.id.text);
		text.setText(mLocalFileList[position].getName());
	    } else if (position == mLocalFileList.length) {
		view = getLayoutInflater().inflate(R.layout.downloadinglistitem, parent, false);
		TextView text = (TextView) view.findViewById(R.id.text);
		text.setTextColor(Color.DKGRAY);
		text.setText(mMissingFiles.get(position - mLocalFileList.length));
		if (mProgress != PROGRESS_UNDFINED) {
		    ProgressBar progressBar = (ProgressBar) view.findViewById(R.id.progressbar);
		    progressBar.setProgress(mProgress);
		    TextView percentage = (TextView) view.findViewById(R.id.percentage);
		    percentage.setText(mProgress + "%");
		}
	    } else if (position > mLocalFileList.length) {
		view = getLayoutInflater().inflate(R.layout.listitem, parent, false);
		TextView text = (TextView) view.findViewById(R.id.text);
		text.setText(mMissingFiles.get(position - mLocalFileList.length));
		text.setTextColor(Color.DKGRAY);
	    }
	    return view;
	}
    }
    
    private static final String HOST = "http://www.coldflake.com:8080";
    
    private IMusicSyncControl mMusicSyncControl;
    private File mlocalSyncFolder;
    private View mFooter;
    private SynFolderAdapter mAdapter;

    @Override
    public void onCreate(Bundle savedInstanceState) {
	super.onCreate(savedInstanceState);
	
	mlocalSyncFolder = new File(Environment.getExternalStorageDirectory(), MusicSyncService.TAG);
	if (!mlocalSyncFolder.exists()) {
	    mlocalSyncFolder.mkdir();
	}

	mFooter = getLayoutInflater().inflate(R.layout.footer, null);
	getListView().setFooterDividersEnabled(false);
	getListView().addFooterView(mFooter, null, false);

	mAdapter = new SynFolderAdapter();
	setListAdapter(mAdapter);
	
	startService(new Intent(MusicSyncService.class.getName()));
	bindService(new Intent(MusicSyncService.class.getName()), this, Context.BIND_AUTO_CREATE);
    }

    @Override
    public void onServiceConnected(ComponentName name, IBinder service) {
	mMusicSyncControl = ((MusicSyncService.LocalBinder) service).getService();
	mMusicSyncControl.registerSyncListener(this);
	mMusicSyncControl.syncFolder(mlocalSyncFolder, HOST, "gerd");
    }

    @Override
    public void onServiceDisconnected(ComponentName name) {
    }

    @Override
    public void onProgressUpdate(int progress) {
	mAdapter.showProgress(progress);    
    }

    @Override
    public void onSyncFinished() {
	Toast.makeText(getApplicationContext(), "Folder synced", Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onFilesMissing(List<String> missingFiles) {
	getListView().removeFooterView(mFooter);
	mAdapter.refreshFolder(missingFiles);
    }
}
