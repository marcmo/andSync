module Download (downloadFile)
  where

import Network.HTTP
import Network.URI(URI)
import Maybe(fromJust)


downloadFile :: (Int,Int) -> URI -> IO (Either String String)
downloadFile (start,end) uri =
    do resp <- simpleHTTP request
       print request
       case resp of
         Left x -> return $ Left ("Error connecting: " ++ show x)
         Right r -> 
             case rspCode r of
               (2,_,_) -> return $ Right (rspBody r)
               (3,_,_) -> -- A HTTP redirect
                 case findHeader HdrLocation r of
                   Nothing -> return $ Left (show r)
               _ -> return $ Left (show r)
    where request = Request {rqURI = uri,
                             rqMethod = GET,
                             rqHeaders = [range],
                             rqBody = ""}
          range = Header HdrRange ("bytes=" ++ show start ++ "-" ++ show end)
                             
