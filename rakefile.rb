require 'rake/clean'

desc 'run formtest'
task :formtest do
	sh 'expresso formtest.js'
end

desc 'test jade expansion'
task :jade do
  sh "node testJade.js views/music/upload.jade"
end
