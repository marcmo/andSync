module Upload (uploadFile)
  where

import Network.HTTP
import Network.Browser
import Network.URI(parseURI,URI)
import System.IO(hGetContents, IOMode(ReadMode),openBinaryFile)
import Data.List(intersperse)
import System.Random(randomRIO)
import Numeric(showHex)
import System.FilePath(takeFileName)

uploadFile ::  URI -> FilePath -> IO (URI, Response String)
uploadFile uri p = do
  r <- uploadRequest uri p
  browse $ do { setAllowRedirects True; request r}
    where uploadRequest :: URI -> FilePath -> IO (Request String)
          uploadRequest uri path = 
              do pkg <- readBinaryFile path
                 boundary <- genBoundary
                 let body = printMultiPart boundary (mkFormData path pkg)
                 return $ Request {
                                  rqURI = uri,
                                  rqMethod = POST,
                                  rqHeaders = [Header HdrContentType ("multipart/form-data; boundary="++boundary),
                                                Header HdrContentLength (show (length body)),
                                                Header HdrAccept ("*/*")],
                                  rqBody = body
                                }

readBinaryFile :: FilePath -> IO String
readBinaryFile path = openBinaryFile path ReadMode >>= hGetContents

genBoundary :: IO String
genBoundary = do i <- randomRIO (0x10000000000000,0xFFFFFFFFFFFFFF) :: IO Integer
                 return $ "----HaskellMultipartClient" ++ showHex i ""

mkFormData :: FilePath -> String -> [BodyPart]
mkFormData path pkg =
  [BodyPart [Header (HdrCustom "Content-disposition") $
             "form-data; name=\"file\"; filename=\""++takeFileName path++"\"",
             Header HdrContentType "video/x-msvideo"]
   pkg]

data BodyPart = BodyPart [Header] String

printMultiPart :: String -> [BodyPart] -> String
printMultiPart boundary xs = 
    concat (intersperse crlf $ map printBodyPart xs) ++ crlf ++ "--" ++ boundary ++ "--" ++ crlf
  where
      printBodyPart :: BodyPart -> String
      printBodyPart (BodyPart hs c) = "--" ++ boundary ++ crlf ++ concatMap show hs ++ crlf ++ c

      crlf = "\r\n"


