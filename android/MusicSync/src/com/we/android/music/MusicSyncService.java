package com.we.android.music;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
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
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Binder;
import android.os.Environment;
import android.os.Handler;
import android.os.IBinder;
import android.util.Log;

public class MusicSyncService extends Service implements IMusicSyncControl {

    class LocalBinder extends Binder {
	public IMusicSyncControl getService() {
	    return MusicSyncService.this;
	}
    }

    private class DownloadTask {
	String mFile;
	int mSize;
	int mDownloadedSize;

	public DownloadTask(String uri, int totalSize, int downloadedSize) {
	    mFile = uri;
	    mSize = totalSize;
	    mDownloadedSize = downloadedSize;
	}
    }

    private final LocalBinder mBinder = new LocalBinder();
    private static final String TAG = "MusicSync";
    private static final String HOST = "http://www.coldflake.com:8080";
    private File mlocalSyncFolder;
    private IMusicSyncListener mMusicSyncListener;
    private Handler mHandler = new Handler();
    private Downloader mDownloader;

    @Override
    public void onCreate() {
	mlocalSyncFolder = new File(Environment.getExternalStorageDirectory(), TAG);
	if (!mlocalSyncFolder.exists()) {
	    mlocalSyncFolder.mkdir();
	}
	mDownloader = new Downloader();
    }

    private List<String> getFilesRelativeToFolder(File folder, List<File> files) {
	// remove leading "/"
	int posPrefix = folder.getAbsolutePath().length() + 1;
	List<String> relativeToSync = new ArrayList<String>();
	for (File file : files) {
	    String relativeFileName = file.getAbsolutePath().substring(posPrefix);
	    relativeToSync.add(relativeFileName);
	}
	return relativeToSync;
    }

    private List<DownloadTask> findMissingFiles(List<String> localFiles, JSONArray syncFolder) {
	Set<String> set = new HashSet<String>();
	for (String file : localFiles) {
	    set.add(file);
	}
	List<DownloadTask> missingFiles = new ArrayList<DownloadTask>();
	try {
	    for(int i=0; i<syncFolder.length();i++) {
		JSONObject fileInfo = syncFolder.getJSONObject(i);
		String file = fileInfo.getString("name");
		int size = fileInfo.getInt("size");
		if (!set.contains(file)) {
		    missingFiles.add(new DownloadTask(file, size, 0));
		}
		Log.d(TAG, "remote file: " + file + " size: " + size);
	    } 
	} catch (JSONException e) {
	    e.printStackTrace();
	}
	return missingFiles;
    }

    class Downloader extends AsyncTask<DownloadTask, Integer, Void> {
	@Override
	protected Void doInBackground(DownloadTask... tasks) {
	    HttpClient httpclient = new DefaultHttpClient();
	    for (final DownloadTask task : tasks) {
		String encoded = HOST + "/content/" + Uri.encode(task.mFile);
		HttpGet httpget = new HttpGet(encoded);
		try {
		    HttpResponse response = httpclient.execute(httpget);
		    if (response.getStatusLine().getStatusCode() == HttpStatus.SC_OK) {
			HttpEntity entity = response.getEntity();
			if (entity != null) {
			    mHandler.post(new Runnable() {
			        @Override
			        public void run() {
			            mMusicSyncListener.onDownloadStarted(task.mFile);
			        }
			    });
			    try {
				FileOutputStream output = new FileOutputStream(new File(mlocalSyncFolder, task.mFile));
				BufferedInputStream input = new BufferedInputStream(entity.getContent());
				try {
				    download(input, output, task.mSize);
				} finally {
				    output.close();
				    input.close();
				} 
			    } catch (Exception e) {
				Log.e(TAG, e.toString());
			    }
			}
			if (isCancelled()) break;
		    } else {
			Log.i(TAG,"download failed: " + response.getStatusLine().toString());
		    }
		} catch(Exception e) {
		    Log.i(TAG,"HttpRequest not successful" + e.toString());
		}
	    }
	    return null;
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
	    mMusicSyncListener.onSyncFinished();
	}
    }

    private String convertStreamToString(InputStream is) {
	BufferedReader reader = new BufferedReader(new InputStreamReader(is));
	StringBuilder sb = new StringBuilder();

	String line = null;
	try {
	    while ((line = reader.readLine()) != null) {
		sb.append(line + "\n");
	    }
	} catch (IOException e) {
	    e.printStackTrace();
	} finally {
	    try {
		is.close();
	    } catch (IOException e) {
		e.printStackTrace();
	    }
	}
	return sb.toString();
    }

    private JSONArray getSyncFolder(String url) {
	HttpClient httpclient = new DefaultHttpClient();
	HttpGet httpget = new HttpGet(url);
	JSONArray files = null;
	try {
	    HttpResponse response = httpclient.execute(httpget);
	    Log.i(TAG,response.getStatusLine().toString());

	    HttpEntity entity = response.getEntity();
	    if (entity != null) {
		InputStream input = entity.getContent();
		String result = convertStreamToString(input);
		input.close();
		Log.i(TAG,result);
		files = new JSONArray(result);
	    }
	} catch (Exception e) {
	    e.printStackTrace();
	} 
	return files;
    }

    private List<File> flattenDir(File dir) {
	List<File> l = new ArrayList<File>();
	flatten(dir, l);
	return l;
    }

    private void flatten(File file, List<File> res) {
	if (file.isDirectory()) {
	    File[] files = file.listFiles();
	    for (File f : files) {
		flatten(f, res);
	    }
	} else {
	    res.add(file);
	}
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
    public void start() {
	List<String> allFilesRelativeToSync = getFilesRelativeToFolder(mlocalSyncFolder, flattenDir(mlocalSyncFolder));

	JSONArray syncFolder = getSyncFolder(HOST + "/content");
	List<DownloadTask> downloadTasks = findMissingFiles(allFilesRelativeToSync, syncFolder);

	DownloadTask[] tasks = downloadTasks.toArray(new DownloadTask[downloadTasks.size()]);
	mDownloader.execute(tasks);
    }

    @Override
    public void stop() {
	mDownloader.cancel(false);
    }
}