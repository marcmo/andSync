package com.we.android.music;

import java.util.ArrayList;
import java.util.List;

import android.app.ListActivity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.IBinder;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.BaseAdapter;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.AdapterView.OnItemClickListener;

public class MusicSync extends ListActivity implements ServiceConnection, IMusicSyncListener {
    class SyncFolderAdapter extends BaseAdapter {
	private static final int PROGRESS_UNDFINED = -1;
	private List<String> mMissingFiles = new ArrayList<String>();
	private int mProgress = PROGRESS_UNDFINED;
	private Cursor mLocalFilesCursor;

	@Override
	public int getCount() {
	    int count = 0;
	    if (mLocalFilesCursor != null) {
		count = mLocalFilesCursor.getCount(); 
	    }
	    return count + mMissingFiles.size();
	}
	
	public void addMissingFiles(List<String> missingFiles) {
	    mMissingFiles.clear();
	    mMissingFiles.addAll(missingFiles);
	    notifyDataSetChanged();
	}
	
	public void addLocalFiles(Cursor cursor) {
	    mLocalFilesCursor = cursor;
	    notifyDataSetChanged();
	}
	
	public void showProgress(int progress) {
	    mProgress = progress;
	    notifyDataSetChanged();
	}

	@Override
	public Object getItem(int position) {
	    mLocalFilesCursor.moveToPosition(position);
	    return mLocalFilesCursor.getString(mLocalFilesCursor.getColumnIndex(android.provider.MediaStore.Audio.Media.DATA));
	}

	@Override
	public long getItemId(int position) {
	    mLocalFilesCursor.moveToPosition(position);
	    return mLocalFilesCursor.getLong(mLocalFilesCursor.getColumnIndex(android.provider.MediaStore.Audio.Media._ID));
	}

	@Override
	public View getView(int position, View convertView, ViewGroup parent) {
	    int localFilesCount = 0;
	    if (mLocalFilesCursor != null) {
		localFilesCount = mLocalFilesCursor.getCount();
	    }
	    View view = null;
	    if (position < localFilesCount) {
		view = getLayoutInflater().inflate(R.layout.listitem, parent, false);
		mLocalFilesCursor.moveToPosition(position);
		TextView title = (TextView) view.findViewById(R.id.title);
		title.setText(mLocalFilesCursor.getString(mLocalFilesCursor.getColumnIndex(android.provider.MediaStore.Audio.Media.TITLE)));
		TextView artist = (TextView) view.findViewById(R.id.artist);
		artist.setText(mLocalFilesCursor.getString(mLocalFilesCursor.getColumnIndex(android.provider.MediaStore.Audio.Media.ARTIST)));
	    } else if (position == localFilesCount) {
		view = getLayoutInflater().inflate(R.layout.downloadinglistitem, parent, false);
		TextView text = (TextView) view.findViewById(R.id.text);
		text.setTextColor(Color.DKGRAY);
		text.setText(mMissingFiles.get(position - localFilesCount));
		if (mProgress != PROGRESS_UNDFINED) {
		    ProgressBar progressBar = (ProgressBar) view.findViewById(R.id.progressbar);
		    progressBar.setProgress(mProgress);
		    TextView percentage = (TextView) view.findViewById(R.id.percentage);
		    percentage.setText(mProgress + "%");
		}
	    } else if (position > localFilesCount) {
		view = getLayoutInflater().inflate(R.layout.listitem, parent, false);
		TextView title = (TextView) view.findViewById(R.id.title);
		title.setText(mMissingFiles.get(position - localFilesCount));
		title.setTextColor(Color.DKGRAY);
	    }
	    return view;
	}
    }
    
    private IMusicSyncControl mMusicSyncControl;
    private View mFooter;
    private SyncFolderAdapter mAdapter;

    @Override
    public void onCreate(Bundle savedInstanceState) {
	super.onCreate(savedInstanceState);

	mFooter = getLayoutInflater().inflate(R.layout.footer, null);
	getListView().setFooterDividersEnabled(false);
	getListView().addFooterView(mFooter, null, false);

	mAdapter = new SyncFolderAdapter();
	getListView().setAdapter(mAdapter);
	
	mAdapter.addLocalFiles(getLocalFiles());
	
	getListView().setOnItemClickListener(new OnItemClickListener() {
	    @Override
	    public void onItemClick(AdapterView<?> parent, View view, int pos, long id) {
		Intent i = new Intent(Intent.ACTION_VIEW);
		i.setDataAndType(Uri.parse((String) mAdapter.getItem(pos)), "audio/*"); 
		startActivity(i);
	    }
	});
	
	startService(new Intent(MusicSyncService.class.getName()));
    }
    
    @Override
    protected void onResume() {
	bindService(new Intent(MusicSyncService.class.getName()), this, Context.BIND_AUTO_CREATE);
        super.onResume();
    }
    
    @Override
    protected void onPause() {
	mMusicSyncControl.unregisterSyncListener(this);
	unbindService(this);
        super.onPause();
    }
    
    private Cursor getLocalFiles() {
	String[] projection = new String[] {
		android.provider.MediaStore.Audio.Media._ID,
		android.provider.MediaStore.Audio.Media.ARTIST,
		android.provider.MediaStore.Audio.Media.TITLE,
		android.provider.MediaStore.Audio.Media.DATA,
		android.provider.MediaStore.Audio.Media.DURATION
	};
	StringBuilder where = new StringBuilder();
	where.append(android.provider.MediaStore.Audio.Media.DATA +" LIKE '/mnt/sdcard/musicsync%'");
	Cursor cursor = getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
		projection,
		where.toString(), null, null);
	return cursor;
    }

    @Override
    public void onServiceConnected(ComponentName name, IBinder service) {
	mMusicSyncControl = ((MusicSyncService.LocalBinder) service).getService();
	mMusicSyncControl.registerSyncListener(this);
	onFilesMissing(mMusicSyncControl.getMissingFiles());
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
	mAdapter.addMissingFiles(missingFiles);
	mAdapter.addLocalFiles(getLocalFiles());
    }
}
