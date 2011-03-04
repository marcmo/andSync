package com.we.android.music;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.apache.http.HttpEntity;
import org.apache.http.HttpResponse;
import org.apache.http.HttpStatus;
import org.apache.http.client.HttpClient;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.DefaultHttpClient;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import android.app.Service;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.media.MediaScannerConnection.MediaScannerConnectionClient;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Binder;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.util.Log;

public class MusicSyncService extends Service implements IMusicSyncControl {

    private class AsyncDownloader extends AsyncTask<Sync, Integer, Void> {
	@Override
	protected Void doInBackground(Sync... syncs) {
	    HttpClient httpclient = new DefaultHttpClient();
	    Sync sync = syncs[0];
	    int completeFiles = 0;
	    for (final SyncTask task : sync.getSyncTasks()) {
		String encoded = Constants.HOST + "/user/get/gerd/" + Uri.encode(task.mFile);
		HttpGet httpget = new HttpGet(encoded);
		try {
		    HttpResponse response = httpclient.execute(httpget);
		    if (response.getStatusLine().getStatusCode() == HttpStatus.SC_OK) {
			HttpEntity entity = response.getEntity();
			if (entity != null) {
			    downloadEntity(entity, task);
			    completeFiles++;
			}
			if (isCancelled()) break;
		    } else {
			Log.i(TAG,"download failed: " + response.getStatusLine().toString());
		    }
		} catch(Exception e) {
		    Log.i(TAG,"HttpRequest not successful" + e.toString());
		}
	    }
	    httpclient.getConnectionManager().shutdown();
	    if (completeFiles == sync.getSyncTasks().size()) {
		mSha1 = sync.getSHA1();
	    }
	    return null;
	}

	private void downloadEntity(HttpEntity entity, SyncTask task) {
	    try {
		File file = new File(mlocalSyncFolder, task.mFile);
		FileOutputStream output = new FileOutputStream(file);
		BufferedInputStream input = new BufferedInputStream(entity.getContent());
		try {
		    download(input, output, task.mSize);
		    updateMissingFiles(task, file);
		} finally {
		    output.close();
		    input.close();
		} 
	    } catch (Exception e) {
		Log.e(TAG, e.toString());
	    }
	}
	
	private void updateMissingFiles(SyncTask task, File file) {
	    mMissingFiles.remove(task.mFile);
	    MediaScannerConnection.scanFile(getApplicationContext(), new String[]{file.toString()}, null, new MediaScannerConnectionClient() {
		@Override
		public void onScanCompleted(String path, Uri uri) {
		    publishMissingFiles(mMissingFiles);
		}
		
		@Override
		public void onMediaScannerConnected() {
		}
	    });
	}

	private void download(InputStream is, OutputStream os, int totalSize) throws IOException {
	    byte[] buffer = new byte[5000];
	    int counter = 0;
	    int bytesRead = is.read(buffer);
	    while (!isCancelled() && (bytesRead != -1)) {
		counter += bytesRead;
		int percentPerFile = (int) ((counter / (float) totalSize) * 100);
		publishProgress(percentPerFile);
		os.write(buffer, 0, bytesRead);
		bytesRead = is.read(buffer);
	    }
	    is.close();
	    os.close();
	}

	@Override
	protected void onProgressUpdate(Integer... values) {
	    mMusicSyncListener.onProgressUpdate(values[0]);
	}

	@Override
	protected void onPostExecute(Void result) {
	    mIsSyncing = false;
	    mMusicSyncListener.onSyncFinished();
	}
    }

    class LocalBinder extends Binder {
	public IMusicSyncControl getService() {
	    return MusicSyncService.this;
	}
    }

    private class Sync {
	private String mSha1;
	private List<SyncTask> mTasks;
	
	public Sync(String sha1, List<SyncTask> tasks) {
	    mSha1 = sha1;
	    mTasks = tasks;
	}
	
	public String getSHA1() {
	    return mSha1;
	}
	
	public List<SyncTask> getSyncTasks() {
	    return mTasks;
	}
    }
    
    private class SyncTask {
	String mFile;
	int mSize;
	int mDownloadedSize;

	public SyncTask(String uri, int totalSize, int downloadedSize) {
	    mFile = uri;
	    mSize = totalSize;
	    mDownloadedSize = downloadedSize;
	}
    }

    private final LocalBinder mBinder = new LocalBinder();
    public static final String TAG = "MusicSync";
    private Handler mHandler = new Handler();
    private AsyncDownloader mDownloader;
    private File mlocalSyncFolder;
    private List<String> mMissingFiles = new ArrayList<String>();
    private boolean mIsSyncing;
    private static final long CYCLIC_CHECK = 60 * 1000;
    private String mSha1 = "undefined";
    

    private IMusicSyncListener mMusicSyncListener = NULL_SYNC_LISTENER;
    private static final IMusicSyncListener NULL_SYNC_LISTENER = new IMusicSyncListener() {
	@Override
	public void onSyncFinished() {
	}

	@Override
	public void onProgressUpdate(int progress) {
	}

	@Override
	public void onFilesMissing(List<String> missingFiles) {
	}
    };
    
    private Runnable mSHA1Checker = new Runnable() {
        @Override
        public void run() {
            if (!mIsSyncing) {
        	HttpClient httpclient = new DefaultHttpClient();
        	String encoded = Constants.HOST + "/user/sha1/" + Constants.USER;
        	HttpGet httpget = new HttpGet(encoded);
        	try {
        	    HttpResponse response = httpclient.execute(httpget);
        	    if (response.getStatusLine().getStatusCode() == HttpStatus.SC_OK) {
        		HttpEntity entity = response.getEntity();
        		String sha1 = Util.convertStreamToString(entity.getContent());
        		if (!sha1.equals(mSha1)) {
        		    doSync(sha1);
        		}
        	    } else {
        		Log.i(TAG, "sha1 check failed: " + response.getStatusLine().toString());
        	    }
        	} catch(Exception e) {
        	    Log.i(TAG,"HttpRequest not successful" + e.toString());
        	}
        	httpclient.getConnectionManager().shutdown();
            }
            mHandler.postDelayed(mSHA1Checker, CYCLIC_CHECK);
        }
    }; 

    @Override
    public void onStart(Intent intent, int startId) {
	mHandler.post(mSHA1Checker);
        super.onStart(intent, startId);
    }
    
    private void doSync(String sha1) {
	mlocalSyncFolder = new File(Environment.getExternalStorageDirectory(), Constants.SYNC_FOLDER);
	if (!mlocalSyncFolder.exists()) {
	    mlocalSyncFolder.mkdir();
	}
	
	if (!mIsSyncing) {
	    List<String> allFilesRelativeToSync = getFilesRelativeToFolder(mlocalSyncFolder, Util.flattenDir(mlocalSyncFolder));

	    JSONArray syncFolder = getSyncFolder(Constants.HOST + "/user/content/" + Constants.USER);
	    List<SyncTask> tasks = findMissingFiles(allFilesRelativeToSync, syncFolder);

	    mMissingFiles.clear();
	    for (SyncTask task : tasks) {
		mMissingFiles.add(task.mFile);
	    }
	    
	    Sync sync = new Sync(sha1, tasks);

	    mIsSyncing = true;
	    mDownloader = new AsyncDownloader();
	    mDownloader.execute(sync);
	}
    }
    
    @Override
    public void onDestroy() {
	mHandler.removeCallbacks(mSHA1Checker);
        super.onDestroy();
    }
    
    private List<String> getFilesRelativeToFolder(File folder, List<File> files) {
	// remove leading "/"
	int posPrefix = folder.getAbsolutePath().length() + 1;
	List<String> relativeToSync = new ArrayList<String>();
	for (File file : files) {
	    String path = file.getAbsolutePath();
	    if (posPrefix < path.length()) {
		String relativeFileName = path.substring(posPrefix);
		relativeToSync.add(relativeFileName);
	    }
	}
	return relativeToSync;
    }

    private List<SyncTask> findMissingFiles(List<String> localFiles, JSONArray syncFolder) {
	Set<String> set = new HashSet<String>();
	for (String file : localFiles) {
	    set.add(file);
	}
	List<SyncTask> missingFiles = new ArrayList<SyncTask>();
	try {
	    for(int i=0; i<syncFolder.length();i++) {
		JSONObject fileInfo = syncFolder.getJSONObject(i);
		String file = fileInfo.getString("name");
		int size = fileInfo.getInt("size");
		if (!set.contains(file)) {
		    missingFiles.add(new SyncTask(file, size, 0));
		}
		Log.d(TAG, "remote file: " + file + " size: " + size);
	    } 
	} catch (JSONException e) {
	    e.printStackTrace();
	}
	return missingFiles;
    }

    private JSONArray getSyncFolder(String url) {
	HttpClient httpclient = new DefaultHttpClient();
	HttpGet httpget = new HttpGet(url);
	JSONArray files = new JSONArray();
	try {
	    HttpResponse response = httpclient.execute(httpget);
	    Log.i(TAG,response.getStatusLine().toString());

	    HttpEntity entity = response.getEntity();
	    if (entity != null) {
		InputStream input = entity.getContent();
		String result = Util.convertStreamToString(input);
		input.close();
		Log.i(TAG,result);
		files = new JSONArray(result);
	    }
	} catch (Exception e) {
	    e.printStackTrace();
	} 
	return files;
    }

    @Override
    public IBinder onBind(Intent intent) {
	return mBinder;
    }

    @Override
    public void registerSyncListener(IMusicSyncListener listener) {
	mMusicSyncListener = listener;
    }

    @Override
    public void unregisterSyncListener(IMusicSyncListener listener) {
	mMusicSyncListener = NULL_SYNC_LISTENER;
    }

    private void publishMissingFiles(final List<String> missingFiles) {
	mHandler.post(new Runnable() {
	    @Override
	    public void run() {
		mMusicSyncListener.onFilesMissing(missingFiles);
	    }
	});
    }

    @Override
    public void stop() {
	if (mDownloader != null) {
	    mDownloader.cancel(false);
	}
    }

    @Override
    public List<String> getMissingFiles() {
	return mMissingFiles;
    }
}